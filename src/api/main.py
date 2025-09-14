from fastapi import FastAPI, Depends, HTTPException, Body, Query
import os
from starlette.middleware.sessions import SessionMiddleware
from datetime import date as dt_date, time as dt_time, timedelta
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert, exists, delete, func
from pydantic import BaseModel, Field
from datetime import date as dt_date, datetime as dt_datetime
from src.db.session import get_session
from src.db.models import (
    Subject, TeacherSubject, TimeSlot, Booking,
    SlotStatus, User, BookingStatus
)

app = FastAPI(title="Schedule API")

# НУЖНО для логина в /admin
app.add_middleware(SessionMiddleware, secret_key=os.getenv("SECRET_KEY", "dev-secret"))

@app.get("/health")
async def health():
    return {"ok": True}

# ---- Subjects ----
class SubjectOut(BaseModel):
    id: int
    name: str
    code: str | None
    class Config:
        from_attributes = True

@app.get("/subjects", response_model=list[SubjectOut])
async def list_subjects(session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Subject).order_by(Subject.name))).scalars().all()
    return rows

# ---- Teacher <-> Subjects binding ----
class TeacherSubjectsIn(BaseModel):
    subject_ids: list[int]

@app.put("/teachers/{teacher_id}/subjects")
async def set_teacher_subjects(teacher_id: int, payload: TeacherSubjectsIn, session: AsyncSession = Depends(get_session)):
    # очистим текущие связи
    await session.execute(delete(TeacherSubject).where(TeacherSubject.teacher_id == teacher_id))
    # добавим новые
    if payload.subject_ids:
        values = [{"teacher_id": teacher_id, "subject_id": sid} for sid in payload.subject_ids]
        await session.execute(insert(TeacherSubject), values)
    await session.commit()
    return {"ok": True, "teacher_id": teacher_id, "subjects": payload.subject_ids}
# ---------- Schemas ----------
class SlotOut(BaseModel):
    id: int
    teacher_id: int
    subject_id: int
    date: dt_date
    start_time: str
    end_time: str
    mode: str | None = None
    capacity: int
    status: SlotStatus
    free_spots: int = Field(..., description="capacity - активные брони")

    class Config:
        from_attributes = True

class CreateBookingIn(BaseModel):
    slot_id: int
    client_id: int  # для MVP просто передаём id пользователя-клиента

class BookingOut(BaseModel):
    id: int
    slot_id: int
    client_id: int
    status: BookingStatus
    class Config:
        from_attributes = True

class CreateTeacherSlotsIn(BaseModel):
    date: dt_date
    subject_id: int
    start_time: dt_time
    end_time: dt_time
    step_min: int | None = None
    capacity: int = 1
    mode: str | None = "online"
    status: SlotStatus = SlotStatus.available
    skip_conflicts: bool = True  # если False — вернём 409 при первом конфликте

class CreatedSlot(BaseModel):
    id: int
    start_time: dt_time
    end_time: dt_time

class CreateTeacherSlotsOut(BaseModel):
    created: list[CreatedSlot]
    skipped: list[tuple[dt_time, dt_time]]  # пары интервалов, которые пересеклись
    total_requested: int
    total_created: int
    total_skipped: int


# ---------- Subjects (оставь как есть у тебя) ----------
# ... ваши /subjects и /teachers/{id}/subjects ...


# ---------- GET /slots ----------
@app.get("/slots", response_model=list[SlotOut])
async def list_slots(
    subject_id: int | None = Query(default=None),
    date: dt_date | None = Query(default=None),
    free_only: bool = Query(default=True),
    session: AsyncSession = Depends(get_session),
):
    # Подсчёт активных броней по слоту
    b_sub = (
        select(Booking.slot_id, func.count().label("bcount"))
        .where(Booking.status != BookingStatus.canceled)
        .group_by(Booking.slot_id)
        .subquery()
    )
    # Базовый запрос по слотам (видим только доступные)
    stmt = (
        select(
            TimeSlot,
            (TimeSlot.capacity - func.coalesce(b_sub.c.bcount, 0)).label("free_spots"),
        )
        .join(b_sub, b_sub.c.slot_id == TimeSlot.id, isouter=True)
        .where(TimeSlot.status == SlotStatus.available)
        .order_by(TimeSlot.date, TimeSlot.start_time)
    )
    if subject_id:
        stmt = stmt.where(TimeSlot.subject_id == subject_id)
    if date:
        stmt = stmt.where(TimeSlot.date == date)

    rows = (await session.execute(stmt)).all()

    # Фильтр только свободных (после подсчёта)
    items: list[SlotOut] = []
    for slot, free_spots in rows:
        if (not free_only) or (free_spots and free_spots > 0):
            items.append(
                SlotOut(
                    id=slot.id,
                    teacher_id=slot.teacher_id,
                    subject_id=slot.subject_id,
                    date=slot.date,
                    start_time=str(slot.start_time),
                    end_time=str(slot.end_time),
                    mode=slot.mode,
                    capacity=slot.capacity,
                    status=slot.status,
                    free_spots=free_spots or 0,
                )
            )
    return items


# ---------- POST /bookings ----------
@app.post("/bookings", response_model=BookingOut, status_code=201)
async def create_booking(payload: CreateBookingIn, session: AsyncSession = Depends(get_session)):
    # 0) клиент существует?
    user = (await session.execute(select(User.id).where(User.id == payload.client_id))).scalar()
    if not user:
        raise HTTPException(status_code=404, detail="Client not found")

    # 1) блокируем слот
    slot = (await session.execute(
        select(TimeSlot).where(TimeSlot.id == payload.slot_id).with_for_update()
    )).scalars().first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    if slot.status != SlotStatus.available:
        raise HTTPException(status_code=409, detail=f"Slot status is {slot.status}")

    # 2) не в прошлом
    if slot.date < dt_datetime.utcnow().date():
        raise HTTPException(status_code=400, detail="Cannot book past slot")

    # 3) уже бронировал этот клиент?
    dup = (await session.execute(
        select(func.count()).select_from(Booking)
        .where(Booking.slot_id == slot.id)
        .where(Booking.client_id == payload.client_id)
        .where(Booking.status != BookingStatus.canceled)
    )).scalar_one()
    if dup:
        raise HTTPException(status_code=409, detail="Already booked by this client")

    # 4) есть ли места
    bcount = (await session.execute(
        select(func.count()).select_from(Booking)
        .where(Booking.slot_id == slot.id)
        .where(Booking.status != BookingStatus.canceled)
    )).scalar_one()
    if bcount >= slot.capacity:
        raise HTTPException(status_code=409, detail="Slot is full")

    try:
        result = await session.execute(
            insert(Booking)
            .values(slot_id=slot.id, client_id=payload.client_id, status=BookingStatus.confirmed)
            .returning(Booking.id, Booking.slot_id, Booking.client_id, Booking.status)
        )
        bid, s_id, c_id, st = result.one()
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Booking conflict")

    return BookingOut(id=bid, slot_id=s_id, client_id=c_id, status=st)

@app.post("/teachers/{teacher_id}/slots", response_model=CreateTeacherSlotsOut, status_code=201)
async def create_teacher_slots(
    teacher_id: int,
    payload: CreateTeacherSlotsIn,
    session: AsyncSession = Depends(get_session),
):
    # 1) Валидация входных данных
    if payload.end_time <= payload.start_time:
        raise HTTPException(status_code=400, detail="end_time must be greater than start_time")

    step_min = payload.step_min or int(os.getenv("SLOT_DURATION_MIN", "45"))
    if step_min <= 0:
        raise HTTPException(status_code=400, detail="step_min must be positive")

    step = timedelta(minutes=step_min)

    # 2) Готовим нарезку
    times: list[tuple[dt_time, dt_time]] = []
    cur = dt_datetime.combine(payload.date, payload.start_time)
    end = dt_datetime.combine(payload.date, payload.end_time)
    while cur + step <= end:
        s = cur.time()
        e = (cur + step).time()
        times.append((s, e))
        cur += step

    if not times:
        raise HTTPException(status_code=400, detail="No slots fit into the interval with given step")

    created: list[CreatedSlot] = []
    skipped: list[tuple[dt_time, dt_time]] = []

    # 3) Транзакция: проверяем конфликты и создаём слоты
    # Конфликт, если существует слот того же учителя и даты, у которого есть пересечение по времени:
    # NOT (existing.end_time <= new.start_time OR existing.start_time >= new.end_time)
    for s_time, e_time in times:
        conflict_stmt = (
            select(exists().where(
                (TimeSlot.teacher_id == teacher_id) &
                (TimeSlot.date == payload.date) &
                (TimeSlot.status != SlotStatus.canceled) &
                ~( (TimeSlot.end_time <= s_time) | (TimeSlot.start_time >= e_time) )
            ))
        )
        has_conflict = (await session.execute(conflict_stmt)).scalar()
        if has_conflict:
            if payload.skip_conflicts:
                skipped.append((s_time, e_time))
                continue
            else:
                raise HTTPException(
                    status_code=409,
                    detail=f"Conflict with existing slot for interval {s_time}-{e_time}",
                )

        res = await session.execute(
            insert(TimeSlot)
            .values(
                teacher_id=teacher_id,
                subject_id=payload.subject_id,
                date=payload.date,
                start_time=s_time,
                end_time=e_time,
                mode=payload.mode,
                capacity=payload.capacity,
                status=payload.status,
            )
            .returning(TimeSlot.id)
        )
        new_id = res.scalar_one()
        created.append(CreatedSlot(id=new_id, start_time=s_time, end_time=e_time))

    await session.commit()

    return CreateTeacherSlotsOut(
        created=created,
        skipped=skipped,
        total_requested=len(times),
        total_created=len(created),
        total_skipped=len(skipped),
    )

# --- GET /teachers/{id}/slots ---
@app.get("/teachers/{teacher_id}/slots", response_model=list[SlotOut])
async def teacher_slots(
    teacher_id: int,
    date: dt_date | None = None,
    date_from: dt_date | None = None,
    date_to: dt_date | None = None,
    session: AsyncSession = Depends(get_session),
):
    b_sub = (
        select(Booking.slot_id, func.count().label("bcount"))
        .where(Booking.status != BookingStatus.canceled)
        .group_by(Booking.slot_id)
        .subquery()
    )
    stmt = (
        select(TimeSlot,
               (TimeSlot.capacity - func.coalesce(b_sub.c.bcount, 0)).label("free_spots"))
        .join(b_sub, b_sub.c.slot_id == TimeSlot.id, isouter=True)
        .where(TimeSlot.teacher_id == teacher_id)
        .order_by(TimeSlot.date, TimeSlot.start_time)
    )
    if date:
        stmt = stmt.where(TimeSlot.date == date)
    if date_from:
        stmt = stmt.where(TimeSlot.date >= date_from)
    if date_to:
        stmt = stmt.where(TimeSlot.date <= date_to)

    rows = (await session.execute(stmt)).all()
    return [
        SlotOut(
            id=s.id, teacher_id=s.teacher_id, subject_id=s.subject_id,
            date=s.date, start_time=str(s.start_time), end_time=str(s.end_time),
            mode=s.mode, capacity=s.capacity, status=s.status, free_spots=fs or 0
        )
        for s, fs in rows
    ]

# --- DELETE /slots/{id} ---
@app.delete("/slots/{slot_id}", status_code=204)
async def delete_slot(slot_id: int, session: AsyncSession = Depends(get_session)):
    # запретим удалять, если есть активные брони
    active = (await session.execute(
        select(func.count()).select_from(Booking)
        .where(Booking.slot_id == slot_id)
        .where(Booking.status != BookingStatus.canceled)
    )).scalar_one()
    if active:
        raise HTTPException(status_code=409, detail="Slot has active bookings")

    res = await session.execute(
        delete(TimeSlot).where(TimeSlot.id == slot_id).returning(TimeSlot.id)
    )
    if not res.scalar():
        raise HTTPException(status_code=404, detail="Slot not found")
    await session.commit()
    return

# --- PATCH /slots/{id} ---
class PatchSlotIn(BaseModel):
    status: SlotStatus | None = None
    capacity: int | None = None

@app.patch("/slots/{slot_id}", response_model=SlotOut)
async def patch_slot(
    slot_id: int,
    payload: PatchSlotIn = Body(...),
    session: AsyncSession = Depends(get_session),
):
    slot = (await session.execute(select(TimeSlot).where(TimeSlot.id == slot_id))).scalars().first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")

    if payload.capacity is not None:
        # нельзя уменьшить capacity ниже уже занятых мест
        used = (await session.execute(
            select(func.count()).select_from(Booking)
            .where(Booking.slot_id == slot_id)
            .where(Booking.status != BookingStatus.canceled)
        )).scalar_one()
        if payload.capacity < used:
            raise HTTPException(status_code=400, detail=f"capacity < used ({used})")
        slot.capacity = payload.capacity

    if payload.status is not None:
        slot.status = payload.status

    await session.commit()

    # посчитаем free_spots на ответ
    used = (await session.execute(
        select(func.count()).select_from(Booking)
        .where(Booking.slot_id == slot_id)
        .where(Booking.status != BookingStatus.canceled)
    )).scalar_one()
    free_spots = (slot.capacity - used)
    return SlotOut(
        id=slot.id, teacher_id=slot.teacher_id, subject_id=slot.subject_id,
        date=slot.date, start_time=str(slot.start_time), end_time=str(slot.end_time),
        mode=slot.mode, capacity=slot.capacity, status=slot.status, free_spots=free_spots
    )

# В САМОМ НИЗУ файла (последняя строка):
# ДОЛЖНО быть последним:
from src.api.admin import init_admin
init_admin(app)