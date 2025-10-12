# src/api/main.py
from __future__ import annotations

import os
import io, csv
import re
import secrets, hashlib
import unicodedata
from datetime import date as dt_date, time as dt_time, timedelta, datetime as dt_datetime, timedelta, timezone
from typing import Optional

from fastapi import (
    FastAPI, Depends, HTTPException, Body, Query, Response, Request,
    APIRouter, BackgroundTasks
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import StreamingResponse

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert, exists, delete, func, update, or_

from pydantic import BaseModel, Field, ConfigDict, constr, EmailStr, conint
from jose import jwt, JWTError

from src.db.session import async_session, get_session
from src.db.models import (
    Subject, TeacherSubject, TimeSlot, Booking,
    SlotStatus, User, BookingStatus, Teacher, LessonType, UserRole, AuthLocal, Setting,
    EmailToken, EmailTokenPurpose
)

from passlib.hash import bcrypt

from src.api.auth_sync import sync_auth_local

import logging

from src.db.models import User, AuthLocal, EmailToken, EmailTokenPurpose 
from src.db.session import AsyncSession

# === Новые импорты для почты ===
from src.services.mail_config import load_mail_config
from src.services.mailer import send_mail
from src.services.render_email import render_html
from src.api.auth import current_user, MeOut
from fastapi.responses import JSONResponse 
import asyncio, socket
from passlib.context import CryptContext
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
# =========================
#        APP & MIDDLEWARE
# =========================
app = FastAPI(title="Schedule API")

# НУЖНО для логина в /admin (sqladmin использует сессии)
app.add_middleware(SessionMiddleware, secret_key=os.getenv("SECRET_KEY", "dev-secret"))

# CORS для web-admin (список из .env: ALLOWED_ORIGINS=http://localhost:3000,...)
allowed = os.getenv("ALLOWED_ORIGINS", "").split(",") if os.getenv("ALLOWED_ORIGINS") else []
if allowed:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in allowed if o.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Total-Count"],
    )

# =========================
#           автосоздание админа
# =========================

@app.on_event("startup")
async def auto_seed_admin():
    if os.getenv("AUTO_SEED_ADMIN", "false").lower() != "true":
        return

    email = os.getenv("ADMIN_EMAIL")
    pwd   = os.getenv("ADMIN_PASSWORD")
    pwd_hash_env = os.getenv("ADMIN_PASSWORD_HASH")
    must_change = os.getenv("ADMIN_REQUIRE_PASSWORD_CHANGE", "false").lower() == "true"

    if not email or not (pwd or pwd_hash_env):
        return

    async with async_session() as session:
        # 1) ищем пользователя
        user = (await session.execute(
            select(User).where(User.email == email)
        )).scalar_one_or_none()

        # 2) создаём, обязательно заполняем NOT NULL поля
        if not user:
            user = User(
                email=email,
                role="admin",        # у тебя роль — строка
                telegram_id=0,       # NOT NULL → ставим 0 (системный)
                is_verified=True,    # убери строку, если такого поля нет
            )
            session.add(user)
            await session.flush()
        else:
            # гарантируем что роль = admin
            await session.execute(
                update(User).where(User.id == user.id).values(role="admin")
            )

        # 3) создаём/обновляем локные креды
        auth = (await session.execute(
            select(AuthLocal).where((AuthLocal.user_id == user.id) | (AuthLocal.email == email))
        )).scalar_one_or_none()

        password_hash = pwd_hash_env or bcrypt.hash(pwd)
        if auth:
            await session.execute(
                update(AuthLocal).where(AuthLocal.id == auth.id).values(
                    email=email,
                    password_hash=password_hash,
                    is_active=True,
                    must_change_password=must_change,
                )
            )
        else:
            session.add(AuthLocal(
                user_id=user.id,
                email=email,
                password_hash=password_hash,
                is_active=True,
                must_change_password=must_change,
            ))

        await session.commit()
# =========================
#           HEALTH
# =========================
@app.get("/health")
async def health():
    return {"ok": True}

# =========================
#           AUTH (JWT)
# =========================

ALGORITHM = "HS256"
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: int | None = None
    email: Optional[str] = None

class MeOut(BaseModel):
    user_id: int | None = None
    email: Optional[str] = None
    role: str
    expires_at: int  # unix ts

# ---------- USERS / TEACHERS Schemas ----------
class UserOut(BaseModel):
    id: int
    telegram_id: int
    role: UserRole
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    phone: str | None = None
    email: str | None = None
    is_verified: bool
    class Config:
        from_attributes = True

class UserCreateIn(BaseModel):
    telegram_id: int
    role: UserRole = UserRole.client  # client|teacher|admin|guest
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    phone: str | None = None
    email: str | None = None

class UserPatchIn(BaseModel):
    role: UserRole | None = None
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    phone: str | None = None
    email: str | None = None
    is_verified: bool | None = None

class TeacherCreateIn(BaseModel):
    user_id: int
    default_mode: str | None = None   # "online" | "offline" | "mixed"
    bio: str | None = None
    subject_ids: list[int] = []

class TeacherCardOut(BaseModel):
    id: int                # teacher_id == user_id
    user: UserOut
    default_mode: str | None = None
    bio: str | None = None
    subject_ids: list[int] = []
    user_name: str

# --- Subjects: Schemas ---
class SubjectOut(BaseModel):
    id: int
    name: str
    short_name: str | None = None
    slug: str | None = None
    category: str | None = None
    level: str | None = None
    color: str | None = None
    default_duration_min: int | None = None

    model_config = ConfigDict(from_attributes=True)

class SubjectCreateIn(BaseModel):
    name: constr(strip_whitespace=True, min_length=1, max_length=200)
    short_name: constr(strip_whitespace=True, max_length=50) | None = None
    slug: constr(strip_whitespace=True, max_length=200) | None = None
    category: constr(strip_whitespace=True, max_length=100) | None = None
    level: constr(strip_whitespace=True, max_length=100) | None = None
    color: constr(strip_whitespace=True, pattern=r"^#?[0-9a-fA-F]{6}$") | None = None
    default_duration_min: conint(ge=1, le=24*60) | None = None

class SubjectPatchIn(BaseModel):
    name: constr(strip_whitespace=True, min_length=1, max_length=200) | None = None
    short_name: constr(strip_whitespace=True, max_length=50) | None = None
    slug: constr(strip_whitespace=True, max_length=200) | None = None
    category: constr(strip_whitespace=True, max_length=100) | None = None
    level: constr(strip_whitespace=True, max_length=100) | None = None
    color: constr(strip_whitespace=True, pattern=r"^#?[0-9a-fA-F]{6}$") | None = None
    default_duration_min: conint(ge=1, le=24*60) | None = None

# ========================настройка==================
class SettingsOut(BaseModel):
    slot_duration_min: int
    reminder_minutes_before: int
    morning_poll_cron: str

class SettingsIn(BaseModel):
    slot_duration_min: int | None = None
    reminder_minutes_before: int | None = None
    morning_poll_cron: str | None = None

async def _get_setting(session: AsyncSession, key: str, default: str | None = None) -> str | None:
    row = (await session.execute(select(Setting.value).where(Setting.key == key))).scalar()
    return row if row is not None else default

async def _upsert_setting(session: AsyncSession, key: str, value: str | None):
    exists = (await session.execute(select(Setting.id).where(Setting.key == key))).scalar()
    if exists:
        await session.execute(update(Setting).where(Setting.key == key).values(value=value))
    else:
        await session.execute(insert(Setting).values(key=key, value=value))
# =========================================================

def _create_access_token(data: dict, minutes: int | None = None) -> str:
    exp_minutes = minutes if minutes is not None else ACCESS_TOKEN_EXPIRE_MINUTES
    expire = dt_datetime.now(timezone.utc) + timedelta(minutes=exp_minutes)
    to_encode = {**data, "exp": expire, "iat": dt_datetime.now(timezone.utc)}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def _decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

def _put_cookie(resp: Response, token: str) -> None:
    resp.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,  # Включи True на проде (HTTPS)
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )

def _token_from_request(request: Request) -> Optional[str]:
    # 1) cookie
    cookie_token = request.cookies.get("access_token")
    if cookie_token:
        return cookie_token
    # 2) Authorization: Bearer
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return None

# --- RBAC helper (минимальный) ---
def require_role(*allowed: str):
    """
    Использование:
        _ = Depends(require_role("admin"))
        _ = Depends(require_role("admin", "teacher"))
    Возвращает объект текущего пользователя (MeOut) или 403.
    """
    async def _dep(user: MeOut = Depends(current_user)):
        if user.role not in allowed:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return _dep

def current_user(request: Request) -> MeOut:
    token = _token_from_request(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        data = _decode_token(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    exp = int(data.get("exp", 0))
    return MeOut(
        user_id=data.get("uid"),
        email=data.get("sub"),
        role=data.get("role", "guest"),
        expires_at=exp,
    )

def _slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = s.encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "subject"

@app.post("/auth/login", response_model=TokenOut, tags=["auth"])
async def login(
    response: Response,
    form: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_session),
):
    # Ищем пользователя по email
    user = (await session.execute(select(User).where(User.email == form.username))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Ищем локальные креды
    auth = (await session.execute(select(AuthLocal).where(AuthLocal.email == form.username))).scalar_one_or_none()
    if not auth or not auth.is_active or not bcrypt.verify(form.password, auth.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Генерируем токен
    payload = {"sub": user.email, "role": user.role.value, "uid": user.id}
    token = _create_access_token(payload)
    _put_cookie(response, token)
    return TokenOut(
        access_token=token,
        role=user.role.value,
        user_id=user.id,
        email=user.email,
    )

@app.get("/auth/me", response_model=MeOut, tags=["auth"])
def auth_me(user: MeOut = Depends(current_user)):
    return user

def _format_user_name(u: UserOut) -> str:
    # Приоритет: "Имя Фамилия" → username → email → "user {id}"
    parts = [p for p in [u.first_name, u.last_name] if p]
    if parts:
        return " ".join(parts)
    if u.username:
        return u.username
    if u.email:
        return u.email
    return f"user {u.id}"

# =========================settingsRouts=================

@app.get("/admin/settings", response_model=SettingsOut, tags=["admin"])
async def admin_get_settings(
    session: AsyncSession = Depends(get_session),
    _=Depends(require_role("admin")),
):
    return SettingsOut(
        slot_duration_min=int((await _get_setting(session, "slot_duration_min", os.getenv("SLOT_DURATION_MIN", "45"))) or 45),
        reminder_minutes_before=int((await _get_setting(session, "reminder_minutes_before", os.getenv("REMINDER_MINUTES_BEFORE", "30"))) or 30),
        morning_poll_cron=(await _get_setting(session, "morning_poll_cron", os.getenv("MORNING_POLL_CRON", "30 7 * * *"))) or "30 7 * * *",
    )

@app.put("/admin/settings", response_model=SettingsOut, tags=["admin"])
async def admin_put_settings(
    payload: SettingsIn,
    session: AsyncSession = Depends(get_session),
    _=Depends(require_role("admin")),
):
    # простая валидация
    if payload.slot_duration_min is not None and payload.slot_duration_min <= 0:
        raise HTTPException(status_code=400, detail="slot_duration_min must be > 0")
    if payload.reminder_minutes_before is not None and payload.reminder_minutes_before <= 0:
        raise HTTPException(status_code=400, detail="reminder_minutes_before must be > 0")

    if payload.slot_duration_min is not None:
        await _upsert_setting(session, "slot_duration_min", str(payload.slot_duration_min))
    if payload.reminder_minutes_before is not None:
        await _upsert_setting(session, "reminder_minutes_before", str(payload.reminder_minutes_before))
    if payload.morning_poll_cron is not None:
        await _upsert_setting(session, "morning_poll_cron", payload.morning_poll_cron)

    await session.commit()
    return await admin_get_settings(session)  # вернуть актуальные значения


# =========================
#           SUBJECTS
# =========================
class SubjectOut(BaseModel):
    id: int
    name: str
    code: str | None
    class Config:
        from_attributes = True

@app.get("/subjects", response_model=list[SubjectOut], tags=["subjects"])
async def list_subjects(session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Subject).order_by(Subject.name))).scalars().all()
    return rows

# Teacher <-> Subjects binding
class TeacherSubjectsIn(BaseModel):
    subject_ids: list[int]

@app.put("/teachers/{teacher_id}/subjects", tags=["teachers"])
async def set_teacher_subjects(
    teacher_id: int,
    payload: TeacherSubjectsIn,
    session: AsyncSession = Depends(get_session),
):
    # очистим текущие связи
    await session.execute(delete(TeacherSubject).where(TeacherSubject.teacher_id == teacher_id))
    # добавим новые
    if payload.subject_ids:
        values = [{"teacher_id": teacher_id, "subject_id": sid} for sid in payload.subject_ids]
        await session.execute(insert(TeacherSubject), values)
    await session.commit()
    return {"ok": True, "teacher_id": teacher_id, "subjects": payload.subject_ids}

# =========================
#            SLOTS
# =========================
class SlotOut(BaseModel):
    id: int
    teacher_id: int
    subject_id: int
    date: dt_date
    start_time: str
    end_time: str
    mode: str | None = None
    lesson_type: str
    capacity: int
    status: SlotStatus
    free_spots: int = Field(..., description="capacity - активные брони")
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
    lesson_type: str = "individual"
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

@app.get("/slots", response_model=list[SlotOut], tags=["slots"])
async def list_slots(
    subject_id: int | None = Query(default=None),
    date: dt_date | None = Query(default=None),
    free_only: bool = Query(default=True),
    mode: str | None = Query(default=None),
    lesson_type: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
):
    # Подсчёт активных броней по слоту
    b_sub = (
        select(Booking.slot_id, func.count().label("bcount"))
        .where(Booking.status != BookingStatus.canceled)
        .group_by(Booking.slot_id)
        .subquery()
    )
    # Базовый запрос по слотам
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
    if mode:
        stmt = stmt.where(TimeSlot.mode == mode)
    if lesson_type:
        try:
            lt_enum = LessonType(lesson_type)
        except ValueError:
            raise HTTPException(status_code=400, detail="lesson_type must be 'individual' or 'group'")
        stmt = stmt.where(TimeSlot.lesson_type == lt_enum)

    rows = (await session.execute(stmt)).all()

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
                    lesson_type=slot.lesson_type.value if hasattr(slot.lesson_type, "value") else str(slot.lesson_type),
                    capacity=slot.capacity,
                    status=slot.status,
                    free_spots=free_spots or 0,
                )
            )
    return items

@app.post("/teachers/{teacher_id}/slots", response_model=CreateTeacherSlotsOut, status_code=201, tags=["slots"])
async def create_teacher_slots(
    teacher_id: int,
    payload: CreateTeacherSlotsIn,
    session: AsyncSession = Depends(get_session),
):
    # 1) Валидация входных данных
    if payload.end_time <= payload.start_time:
        raise HTTPException(status_code=400, detail="end_time must be greater than start_time")
    db_step = await _get_setting(session, "slot_duration_min", os.getenv("SLOT_DURATION_MIN", "45"))
    step_min = payload.step_min or int(db_step or 45)
    if step_min <= 0:
        raise HTTPException(status_code=400, detail="step_min must be positive")
    step = timedelta(minutes=step_min)

    # lesson_type -> Enum + валидация capacity
    try:
        lt_enum = LessonType(payload.lesson_type)
    except ValueError:
        raise HTTPException(status_code=400, detail="lesson_type must be 'individual' or 'group'")
    if lt_enum == LessonType.individual and payload.capacity != 1:
        raise HTTPException(status_code=400, detail="For individual lessons capacity must be 1")
    if lt_enum == LessonType.group and payload.capacity < 2:
        raise HTTPException(status_code=400, detail="For group lessons capacity must be >= 2")

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
    for s_time, e_time in times:
        conflict_stmt = (
            select(exists().where(
                (TimeSlot.teacher_id == teacher_id) &
                (TimeSlot.date == payload.date) &
                (TimeSlot.status != SlotStatus.canceled) &
                ~((TimeSlot.end_time <= s_time) | (TimeSlot.start_time >= e_time))
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
                lesson_type=lt_enum,      # важное добавление
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

@app.get("/teachers/{teacher_id}/slots", response_model=list[SlotOut], tags=["slots"])
async def teacher_slots(
    teacher_id: int,
    date: dt_date | None = None,
    date_from: dt_date | None = None,
    date_to: dt_date | None = None,
    mode: str | None = Query(default=None),
    lesson_type: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
):
    # валидация lesson_type из query (если передан)
    lt_enum: LessonType | None = None
    if lesson_type is not None:
        try:
            lt_enum = LessonType(lesson_type)
        except ValueError:
            raise HTTPException(status_code=400, detail="lesson_type must be 'individual' or 'group'")

    b_sub = (
        select(Booking.slot_id, func.count().label("bcount"))
        .where(Booking.status != BookingStatus.canceled)
        .group_by(Booking.slot_id)
        .subquery()
    )

    stmt = (
        select(
            TimeSlot,
            (TimeSlot.capacity - func.coalesce(b_sub.c.bcount, 0)).label("free_spots"),
        )
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
    if mode:
        stmt = stmt.where(TimeSlot.mode == mode)
    if lt_enum is not None:
        stmt = stmt.where(TimeSlot.lesson_type == lt_enum)

    rows = (await session.execute(stmt)).all()
    return [
        SlotOut(
            id=s.id,
            teacher_id=s.teacher_id,
            subject_id=s.subject_id,
            date=s.date,
            start_time=str(s.start_time),
            end_time=str(s.end_time),
            mode=s.mode,
            lesson_type=(s.lesson_type.value if hasattr(s.lesson_type, "value") else str(s.lesson_type)),
            capacity=s.capacity,
            status=s.status,
            free_spots=fs or 0,
        )
        for s, fs in rows
    ]

class PatchSlotIn(BaseModel):
    start_time: str | None = None
    end_time: str | None = None
    subject_id: int | None = None
    mode: str | None = None    
    status: SlotStatus | None = None
    capacity: int | None = None
    lesson_type: str | None = None

@app.patch("/slots/{slot_id}", response_model=SlotOut, tags=["slots"])
async def patch_slot(
    slot_id: int,
    payload: PatchSlotIn = Body(...),
    session: AsyncSession = Depends(get_session),
):
    slot = (await session.execute(select(TimeSlot).where(TimeSlot.id == slot_id))).scalars().first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")

    # Текущее число занятых мест (для валидации capacity)
    used = (await session.execute(
        select(func.count()).select_from(Booking)
        .where(Booking.slot_id == slot_id)
        .where(Booking.status != BookingStatus.canceled)
    )).scalar_one()

    # --- ВРЕМЯ ---
    def _to_hms(s: str) -> str:
        return s if len(s) == 8 else (s + ":00")  # "HH:MM" -> "HH:MM:00"

    if payload.start_time is not None:
        slot.start_time = _to_hms(payload.start_time)
    if payload.end_time is not None:
        slot.end_time = _to_hms(payload.end_time)
    if (payload.start_time is not None) or (payload.end_time is not None):
        if slot.end_time <= slot.start_time:
            raise HTTPException(status_code=400, detail="end_time must be greater than start_time")

    # --- ПРЕДМЕТ ---
    if payload.subject_id is not None:
        slot.subject_id = payload.subject_id

    # --- РЕЖИМ ---
    if payload.mode is not None:
        if payload.mode not in ("online", "offline"):
            raise HTTPException(status_code=400, detail="mode must be 'online' or 'offline'")
        slot.mode = payload.mode

    # --- ТИП ЗАНЯТИЯ ---
    if payload.lesson_type is not None:
        try:
            slot.lesson_type = LessonType(payload.lesson_type)
        except ValueError:
            raise HTTPException(status_code=400, detail="lesson_type must be 'individual' or 'group'")

    # --- CAPACITY ---
    if payload.capacity is not None:
        if payload.capacity < used:
            raise HTTPException(status_code=400, detail=f"capacity < used ({used})")
        slot.capacity = payload.capacity

    # Согласованность тип ↔ вместимость
    if slot.lesson_type == LessonType.individual and slot.capacity != 1:
        raise HTTPException(status_code=400, detail="For individual lessons capacity must be 1")
    if slot.lesson_type == LessonType.group and slot.capacity < 2:
        raise HTTPException(status_code=400, detail="For group lessons capacity must be >= 2")

    # --- СТАТУС ---
    if payload.status is not None:
        slot.status = payload.status

    await session.commit()

    # Пересчитать свободные места
    used = (await session.execute(
        select(func.count()).select_from(Booking)
        .where(Booking.slot_id == slot_id)
        .where(Booking.status != BookingStatus.canceled)
    )).scalar_one()
    free_spots = slot.capacity - used

    return SlotOut(
        id=slot.id,
        teacher_id=slot.teacher_id,
        subject_id=slot.subject_id,
        date=slot.date,
        start_time=str(slot.start_time),
        end_time=str(slot.end_time),
        mode=slot.mode,
        lesson_type=(slot.lesson_type.value if hasattr(slot.lesson_type, "value") else str(slot.lesson_type)),
        capacity=slot.capacity,
        status=slot.status,
        free_spots=free_spots,
    )

@app.delete("/slots/{slot_id}", status_code=204, tags=["slots"])
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

# =========================
#          BOOKINGS
# =========================
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

@app.post("/bookings", response_model=BookingOut, status_code=201, tags=["bookings"])
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

# ---- BOOKINGS LIST (responses/filters) ----
class BookingRow(BaseModel):
    id: int
    status: BookingStatus
    slot_id: int
    client_id: int
    # денормализованные поля для таблиц/отчётов
    date: dt_date
    start_time: str
    end_time: str
    teacher_id: int
    subject_id: int

class BookingsFilter(BaseModel):
    teacher_id: int | None = None
    client_id: int | None = None
    status: BookingStatus | None = None
    date_from: dt_date | None = None
    date_to: dt_date | None = None
    subject_id: int | None = None
    limit: int = Field(200, ge=1, le=1000)
    offset: int = Field(0, ge=0)

@app.get("/bookings", response_model=list[BookingRow], tags=["bookings"])
async def list_bookings(
    response: Response,                                  # ← без Depends и без дефолта, стоит первым
    teacher_id: int | None = Query(None),
    client_id: int | None = Query(None),
    status: BookingStatus | None = Query(None),
    date_from: dt_date | None = Query(None),
    date_to: dt_date | None = Query(None),
    subject_id: int | None = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
    _=Depends(require_role("admin")),
):
    base = (
        select(
            Booking.id, Booking.status, Booking.slot_id, Booking.client_id,
            TimeSlot.date, TimeSlot.start_time, TimeSlot.end_time,
            TimeSlot.teacher_id, TimeSlot.subject_id,
        )
        .join(TimeSlot, TimeSlot.id == Booking.slot_id)
    )

    if teacher_id is not None:
        base = base.where(TimeSlot.teacher_id == teacher_id)
    if client_id is not None:
        base = base.where(Booking.client_id == client_id)
    if status is not None:
        base = base.where(Booking.status == status)
    if subject_id is not None:
        base = base.where(TimeSlot.subject_id == subject_id)
    if date_from is not None:
        base = base.where(TimeSlot.date >= date_from)
    if date_to is not None:
        base = base.where(TimeSlot.date <= date_to)

    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    response.headers["X-Total-Count"] = str(total)

    stmt = base.order_by(TimeSlot.date.desc(), TimeSlot.start_time.desc(), Booking.id.desc()) \
               .limit(limit).offset(offset)

    rows = (await session.execute(stmt)).all()
    return [
        BookingRow(
            id=r[0], status=r[1], slot_id=r[2], client_id=r[3],
            date=r[4], start_time=str(r[5]), end_time=str(r[6]),
            teacher_id=r[7], subject_id=r[8],
        )
        for r in rows
    ]

@app.post("/auth/logout", tags=["auth"])
def auth_logout(response: Response):
    # убираем httpOnly cookie
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

# ---- BOOKINGS LIST (responses/filters) ----
class BookingRow(BaseModel):
    id: int
    status: BookingStatus
    slot_id: int
    client_id: int
    # денормализованные поля для таблиц/отчётов
    date: dt_date
    start_time: str
    end_time: str
    teacher_id: int
    subject_id: int

class BookingsFilter(BaseModel):
    teacher_id: int | None = None
    client_id: int | None = None
    status: BookingStatus | None = None
    date_from: dt_date | None = None
    date_to: dt_date | None = None
    subject_id: int | None = None
    limit: int = Field(200, ge=1, le=1000)
    offset: int = Field(0, ge=0)

class TeacherLoadRow(BaseModel):
    teacher_id: int
    lessons_count: int
    minutes_total: int
    hours_total: float

@app.get("/reports/teacher-load", response_model=TeacherLoadRow, tags=["reports"])
async def report_teacher_load(
    teacher_id: int = Query(...),
    date_from: dt_date = Query(...),
    date_to: dt_date = Query(...),
    session: AsyncSession = Depends(get_session),
):
    # считаем только confirmed брони
    stmt = (
        select(
            func.count(Booking.id),
            func.sum(
                (func.extract("epoch", TimeSlot.end_time) - func.extract("epoch", TimeSlot.start_time)) / 60.0
            ),
        )
        .join(TimeSlot, TimeSlot.id == Booking.slot_id)
        .where(TimeSlot.teacher_id == teacher_id)
        .where(Booking.status == BookingStatus.confirmed)
        .where(TimeSlot.date >= date_from, TimeSlot.date <= date_to)
    )
    lessons_count, minutes_total = (await session.execute(stmt)).one()
    lessons_count = int(lessons_count or 0)
    minutes_total = int(float(minutes_total or 0))
    return TeacherLoadRow(
        teacher_id=teacher_id,
        lessons_count=lessons_count,
        minutes_total=minutes_total,
        hours_total=round(minutes_total / 60.0, 2),
    )

@app.get("/users", response_model=list[UserOut], tags=["users"])
async def list_users(
    response: Response,                             # ← важно: первым, без дефолта
    role: UserRole | None = Query(None),
    is_verified: bool | None = Query(None),
    q: str | None = Query(None, description="поиск по имени/username/email/phone"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
    _=Depends(require_role("admin")),
):
    base = select(User)

    if role is not None:
        base = base.where(User.role == role)
    if is_verified is not None:
        base = base.where(User.is_verified == is_verified)
    if q:
        like = f"%{q}%"
        base = base.where(or_(
            User.first_name.ilike(like),
            User.last_name.ilike(like),
            User.username.ilike(like),
            User.email.ilike(like),
            User.phone.ilike(like),
        ))

    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    response.headers["X-Total-Count"] = str(total)

    stmt = base.order_by(User.id).limit(limit).offset(offset)
    rows = (await session.execute(stmt)).scalars().all()
    return rows

@app.post("/users", response_model=UserOut, status_code=201, tags=["users"])
async def create_user(payload: UserCreateIn, session: AsyncSession = Depends(get_session)):
    # проверим уникальность telegram_id
    exists_tg = (await session.execute(
        select(func.count()).select_from(User).where(User.telegram_id == payload.telegram_id)
    )).scalar_one()
    if exists_tg:
        raise HTTPException(status_code=409, detail="User with this telegram_id already exists")

    res = await session.execute(
        insert(User)
        .values(
            telegram_id=payload.telegram_id,
            role=payload.role,
            first_name=payload.first_name,
            last_name=payload.last_name,
            username=payload.username,
            phone=payload.phone,
            email=payload.email,
            is_verified=(payload.role != UserRole.guest),
        )
        .returning(User)
    )
    user: User = res.scalars().one()
    await session.commit()

    # если сразу создаём учителя — сделаем пустую карточку Teacher (без предметов)
    if payload.role == UserRole.teacher:
        await session.execute(
            insert(Teacher).values(id=user.id, default_mode=None, bio=None)
        )
        await session.commit()

    return user

@app.patch("/users/{user_id}", response_model=UserOut, tags=["users"])
async def patch_user(
    user_id: int,
    payload: UserPatchIn,
    session: AsyncSession = Depends(get_session),
):
    user = (await session.execute(select(User).where(User.id == user_id))).scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    data = {}
    for field in ("role", "first_name", "last_name", "username", "phone", "email", "is_verified"):
        val = getattr(payload, field)
        if val is not None:
            data[field] = val

    if not data:
        return user

    # если меняем роль на teacher и карточки Teacher ещё нет — создадим
    if data.get("role") == UserRole.teacher:
        has_teacher = (await session.execute(
            select(func.count()).select_from(Teacher).where(Teacher.id == user_id)
        )).scalar_one()
        if not has_teacher:
            await session.execute(insert(Teacher).values(id=user_id))

    await session.execute(update(User).where(User.id == user_id).values(**data))
    await session.commit()
    # вернуть актуальную запись
    # вызвать синхронизацию (учитывает role/is_verified/email)
    from .auth_sync import sync_auth_local
    await sync_auth_local(session, user_id)
    # перечитать и вернуть
    user = (await session.execute(select(User).where(User.id == user_id))).scalars().first()
    return user


@app.post("/teachers", response_model=TeacherCardOut, status_code=201, tags=["teachers"])
async def create_teacher(
    payload: TeacherCreateIn,
    session: AsyncSession = Depends(get_session),
):
    # проверим, что есть такой user
    user = (await session.execute(select(User).where(User.id == payload.user_id))).scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # если уже создан Teacher — вернём 409
    exists_teacher = (await session.execute(
        select(func.count()).select_from(Teacher).where(Teacher.id == payload.user_id)
    )).scalar_one()
    if exists_teacher:
        raise HTTPException(status_code=409, detail="Teacher already exists for this user_id")

    # создаём Teacher
    await session.execute(
        insert(Teacher).values(
            id=payload.user_id,
            default_mode=payload.default_mode,
            bio=payload.bio,
        )
    )

    # добавим предметы, если есть
    if payload.subject_ids:
        values = [{"teacher_id": payload.user_id, "subject_id": sid} for sid in payload.subject_ids]
        await session.execute(insert(TeacherSubject), values)

    # если роль у пользователя не teacher — поднимем
    if user.role != UserRole.teacher:
        await session.execute(
            update(User).where(User.id == payload.user_id).values(role=UserRole.teacher)
        )
        await session.commit()  # коммитим изменение роли перед синхронизацией

    # 🔁 синхронизируем с auth_local (создаст логин + письмо «Задать пароль»)
    await sync_auth_local(session, user_id=payload.user_id)

    # ответ
    subj_ids = payload.subject_ids or []
    uo = UserOut.model_validate(user)
    return TeacherCardOut(
        id=payload.user_id,
        user=uo,
        default_mode=payload.default_mode,
        bio=payload.bio,
        subject_ids=subj_ids,
        user_name=_format_user_name(uo),
    )


@app.get("/teachers", response_model=list[TeacherCardOut], tags=["teachers"])
async def list_teachers(
    response: Response,                             # ← первым
    q: str | None = Query(None, description="поиск по имени/username/email/phone"),
    exclude_teachers: bool = Query(False, description="если True — вернуть только тех, у кого нет карточки Teacher"),
    subject_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
    _=Depends(require_role("admin")),
):
    from src.db.models import Teacher  # наверху уже импортируется, строка для ясности
    base = select(Teacher, User).join(User, User.id == Teacher.id)

    if q:
        like = f"%{q}%"
        base = base.where(or_(
            User.first_name.ilike(like),
            User.last_name.ilike(like),
            User.username.ilike(like),
            User.email.ilike(like),
            User.phone.ilike(like),
        ))
    if exclude_teachers:
       # LEFT JOIN Teacher и фильтр тех, у кого карточки Teacher нет
       base = base.outerjoin(Teacher, Teacher.id == User.id).where(Teacher.id.is_(None))
    if subject_id is not None:
        base = base.join(TeacherSubject, TeacherSubject.teacher_id == Teacher.id)\
                   .where(TeacherSubject.subject_id == subject_id)

    # total
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    response.headers["X-Total-Count"] = str(total)

    stmt = base.order_by(User.first_name.nulls_last(), User.id).limit(limit).offset(offset)
    rows = (await session.execute(stmt)).all()
    teacher_ids = [t.id for t, _ in rows] or [0]

    # пачкой подтягиваем subject_ids
    subq = (
        select(TeacherSubject.teacher_id, func.array_agg(TeacherSubject.subject_id))
        .where(TeacherSubject.teacher_id.in_(teacher_ids))
        .group_by(TeacherSubject.teacher_id)
    )
    subs = {tid: arr for tid, arr in (await session.execute(subq)).all()}

    out: list[TeacherCardOut] = []
    for t, u in rows:
        uo = UserOut.model_validate(u)
        out.append(TeacherCardOut(
            id=t.id,
            user=uo,
            default_mode=t.default_mode,
            bio=t.bio,
            subject_ids=list(subs.get(t.id, [])) if subs.get(t.id) else [],
            user_name=_format_user_name(uo),
        ))
    return out

# ---- SAFE DELETE TEACHER ----
@app.delete("/teachers/{teacher_id}", tags=["teachers"])
async def delete_teacher(
    teacher_id: int,
    session: AsyncSession = Depends(get_session),
):
    # есть ли карточка Teacher?
    teacher = (await session.execute(select(Teacher).where(Teacher.id == teacher_id))).scalars().first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    # 1) удалим все слоты учителя (booking.slot_id ondelete='CASCADE' уже есть — брони удалятся следом)
    await session.execute(delete(TimeSlot).where(TimeSlot.teacher_id == teacher_id))
    # 2) teacher_subjects удалятся каскадом (в модели уже ondelete='CASCADE')
    # 3) удаляем Teacher
    await session.execute(delete(Teacher).where(Teacher.id == teacher_id))

    await session.commit()
    return {"ok": True, "deleted": {"teacher_id": teacher_id}}

# ---- SAFE DELETE USER ----
@app.delete("/users/{user_id}", tags=["users"])
async def delete_user(
    user_id: int,
    force: bool = Query(False, description="если True — удалит и Teacher-данные этого пользователя"),
    session: AsyncSession = Depends(get_session),
):
    # если есть Teacher — либо блокируем, либо удаляем через delete_teacher
    has_teacher = (await session.execute(
        select(func.count()).select_from(Teacher).where(Teacher.id == user_id)
    )).scalar_one()

    if has_teacher:
        if not force:
            raise HTTPException(
                status_code=409,
                detail="User is a teacher. Delete /teachers/{id} first or use ?force=true"
            )
        # выполним безопасное удаление учителя
        await delete_teacher(user_id, session)

    # у клиента могут быть брони. Варианты:
    # - жёстко запретить, если есть активные брони:
    active = (await session.execute(
        select(func.count()).select_from(Booking)
        .where(Booking.client_id == user_id)
        .where(Booking.status != BookingStatus.canceled)
    )).scalar_one()
    if active:
        raise HTTPException(status_code=409, detail="User has active bookings")

    # удалим отменённые брони клиента (если остались)
    await session.execute(delete(Booking).where(Booking.client_id == user_id))

    # и самого юзера
    res = await session.execute(delete(User).where(User.id == user_id).returning(User.id))
    if not res.scalar():
        raise HTTPException(status_code=404, detail="User not found")

    await session.commit()
    return {"ok": True, "deleted": {"user_id": user_id}}

class BookingPatchIn(BaseModel):
    status: BookingStatus

@app.patch("/bookings/{booking_id}", response_model=BookingOut, tags=["bookings"])
async def patch_booking(
    booking_id: int,
    payload: BookingPatchIn,
    session: AsyncSession = Depends(get_session),
    _=Depends(require_role("admin")),
):
    b = (await session.execute(select(Booking).where(Booking.id == booking_id))).scalars().first()
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    b.status = payload.status
    await session.commit()
    return BookingOut.model_validate(b)

@app.delete("/bookings/{booking_id}", status_code=204, tags=["bookings"])
async def delete_booking(
    booking_id: int,
    session: AsyncSession = Depends(get_session),
    _=Depends(require_role("admin")),
):
    res = await session.execute(delete(Booking).where(Booking.id == booking_id).returning(Booking.id))
    if not res.scalar():
        raise HTTPException(status_code=404, detail="Booking not found")
    await session.commit()
    return

@app.get("/bookings/export.csv", tags=["bookings"])
async def export_bookings_csv(
    teacher_id: int | None = Query(None),
    client_id: int | None = Query(None),
    status: BookingStatus | None = Query(None),
    date_from: dt_date | None = Query(None),
    date_to: dt_date | None = Query(None),
    subject_id: int | None = Query(None),
    session: AsyncSession = Depends(get_session),
    _=Depends(require_role("admin")),
):
    base = (
        select(
            Booking.id, Booking.status, Booking.slot_id, Booking.client_id,
            TimeSlot.date, TimeSlot.start_time, TimeSlot.end_time,
            TimeSlot.teacher_id, TimeSlot.subject_id,
        )
        .join(TimeSlot, TimeSlot.id == Booking.slot_id)
    )
    if teacher_id is not None:
        base = base.where(TimeSlot.teacher_id == teacher_id)
    if client_id is not None:
        base = base.where(Booking.client_id == client_id)
    if status is not None:
        base = base.where(Booking.status == status)
    if subject_id is not None:
        base = base.where(TimeSlot.subject_id == subject_id)
    if date_from is not None:
        base = base.where(TimeSlot.date >= date_from)
    if date_to is not None:
        base = base.where(TimeSlot.date <= date_to)

    rows = (await session.execute(base.order_by(TimeSlot.date, TimeSlot.start_time))).all()

    buf = io.StringIO()
    buf.write("\ufeff")  # BOM для Excel
    writer = csv.writer(buf, delimiter=';')
    writer.writerow(["id","status","date","start_time","end_time","teacher_id","subject_id","slot_id","client_id"])
    for r in rows:
        writer.writerow([r[0], r[1], r[4], str(r[5]), str(r[6]), r[7], r[8], r[2], r[3]])
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="bookings.csv"'}
    )

# ---------- SUBJECTS CRUD (admin only) ----------

@app.get("/subjects", response_model=list[SubjectOut], tags=["subjects"])
async def list_subjects(
    response: Response,                                 # важно: первым, без дефолта
    q: str | None = Query(None, description="поиск по name/short_name/slug/category/level"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
    _=Depends(require_role("admin")),
):
    base = select(Subject)
    if q:
        like = f"%{q}%"
        base = base.where(or_(
            Subject.name.ilike(like),
            Subject.short_name.ilike(like),
            Subject.slug.ilike(like),
            Subject.category.ilike(like),
            Subject.level.ilike(like),
        ))

    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    response.headers["X-Total-Count"] = str(total)

    rows = (await session.execute(base.order_by(Subject.id).limit(limit).offset(offset))).scalars().all()
    return rows


@app.post("/subjects", response_model=SubjectOut, status_code=201, tags=["subjects"])
async def create_subject(
    payload: SubjectCreateIn,
    session: AsyncSession = Depends(get_session),
    _=Depends(require_role("admin")),
):
    # slug
    slug = payload.slug or _slugify(payload.name)
    # нормализуем цвет: добавим '#' если не передали
    color = payload.color
    if color and not color.startswith("#"):
        color = "#" + color

    # уникальность name/slug (быстрая проверка)
    exists = (await session.execute(
        select(Subject.id).where(or_(Subject.name == payload.name, Subject.slug == slug))
    )).first()
    if exists:
        raise HTTPException(status_code=409, detail="Subject with same name/slug already exists")

    obj = Subject(
        name=payload.name,
        short_name=payload.short_name,
        slug=slug,
        category=payload.category,
        level=payload.level,
        color=color,
        default_duration_min=payload.default_duration_min,
    )
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return SubjectOut.model_validate(obj)


@app.get("/subjects/{subject_id}", response_model=SubjectOut, tags=["subjects"])
async def get_subject(
    subject_id: int,
    session: AsyncSession = Depends(get_session),
    _=Depends(require_role("admin")),
):
    obj = (await session.execute(select(Subject).where(Subject.id == subject_id))).scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Subject not found")
    return SubjectOut.model_validate(obj)


@app.patch("/subjects/{subject_id}", response_model=SubjectOut, tags=["subjects"])
async def patch_subject(
    subject_id: int,
    payload: SubjectPatchIn,
    session: AsyncSession = Depends(get_session),
    _=Depends(require_role("admin")),
):
    obj = (await session.execute(select(Subject).where(Subject.id == subject_id))).scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Subject not found")

    if payload.name is not None:
        obj.name = payload.name
    if payload.short_name is not None:
        obj.short_name = payload.short_name
    if payload.slug is not None:
        obj.slug = payload.slug or _slugify(payload.name or obj.name)
    if payload.category is not None:
        obj.category = payload.category
    if payload.level is not None:
        obj.level = payload.level
    if payload.color is not None:
        obj.color = payload.color if payload.color.startswith("#") else f"#{payload.color}"
    if payload.default_duration_min is not None:
        obj.default_duration_min = payload.default_duration_min

    # проверка уникальности name/slug, если менялись
    exists = (await session.execute(
        select(Subject.id).where(
            or_(Subject.name == obj.name, Subject.slug == obj.slug),
            Subject.id != subject_id
        )
    )).first()
    if exists:
        raise HTTPException(status_code=409, detail="Subject with same name/slug already exists")

    await session.commit()
    await session.refresh(obj)
    return SubjectOut.model_validate(obj)


@app.delete("/subjects/{subject_id}", status_code=204, tags=["subjects"])
async def delete_subject(
    subject_id: int,
    session: AsyncSession = Depends(get_session),
    _=Depends(require_role("admin")),
):
    # запретим удаление, если предмет используется (у учителя или в слотах)
    used_by_teacher = (await session.execute(
        select(func.count()).select_from(TeacherSubject).where(TeacherSubject.subject_id == subject_id)
    )).scalar_one()

    used_in_slots = (await session.execute(
        select(func.count()).select_from(TimeSlot).where(TimeSlot.subject_id == subject_id)
    )).scalar_one()

    if (used_by_teacher or used_in_slots):
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Subject is in use and cannot be deleted",
                "used_by_teacher_count": used_by_teacher,
                "used_in_slots_count": used_in_slots,
            },
        )

    res = await session.execute(delete(Subject).where(Subject.id == subject_id).returning(Subject.id))
    deleted_id = res.scalar()
    if not deleted_id:
        raise HTTPException(status_code=404, detail="Subject not found")
    await session.commit()
    return


# =============== MAIL SETTINGS (admin only) ===============

from typing import Dict
from fastapi import Body, Depends
from pydantic import BaseModel

class MailSettingsIn(BaseModel):
    enabled: bool
    from_addr: str
    host: str
    port: int
    user: str
    password: str
    starttls: bool

async def require_admin(user: MeOut = Depends(current_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Требуются права администратора")
    return user

@app.get("/admin/settings/mail", dependencies=[Depends(require_admin)], tags=["admin"])
async def get_mail_settings(session: AsyncSession = Depends(get_session)):
    cfg = await load_mail_config(session)
    return {
        "enabled": cfg.enabled,
        "from_addr": cfg.from_addr,
        "host": cfg.host,
        "port": cfg.port,
        "user": cfg.user,
        # НЕ возвращаем password в целях безопасности
        "starttls": cfg.starttls,
    }

@app.put("/admin/settings/mail", dependencies=[Depends(require_admin)], tags=["admin"])
async def put_mail_settings(
    data: MailSettingsIn,
    session: AsyncSession = Depends(get_session)
):
    kv: Dict[str, str] = {
        "MAIL_ENABLED": "true" if data.enabled else "false",
        "MAIL_FROM": data.from_addr,
        "MAIL_SMTP_HOST": data.host,
        "MAIL_SMTP_PORT": str(data.port),
        "MAIL_SMTP_USER": data.user,
        "MAIL_SMTP_PASSWORD": data.password,
        "MAIL_SMTP_STARTTLS": "true" if data.starttls else "false",
    }
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    for k, v in kv.items():
        stmt = pg_insert(Setting).values(key=k, value=v)
        stmt = stmt.on_conflict_do_update(index_elements=[Setting.key], set_=dict(value=v))
        await session.execute(stmt)
    await session.commit()
    return {"ok": True}


# =============== EMAIL & AUTH ===============
logger = logging.getLogger(__name__) 

router = APIRouter(prefix="/auth", tags=["auth"])

class ForgotPasswordIn(BaseModel):
    email: EmailStr
    captcha: str | None = None

@router.post("/password/forgot")
async def forgot_password(payload: ForgotPasswordIn, session: AsyncSession = Depends(get_session)):
    # 1) найти пользователя по локальному email
    user_id = (await session.execute(
        select(User.id)
        .join(AuthLocal, AuthLocal.user_id == User.id)
        .where(AuthLocal.email == payload.email)
    )).scalar_one_or_none()

    # Всегда отвечаем 200, чтобы не палить существование email
    if not user_id:
        return {"ok": True, "message": "Если такой email существует, мы отправили письмо со ссылкой на сброс."}

    # 2) создать токен
    token = secrets.token_urlsafe(48)
    expires_at = dt_datetime.now(timezone.utc) + timedelta(hours=1)

    session.add(EmailToken(
        user_id=user_id,
        purpose=EmailTokenPurpose.reset,
        token=token,
        expires_at=expires_at,
    ))
    await session.commit()

    # 3) отправить письмо
    base_url = os.getenv("PUBLIC_WEB_BASE_URL", "http://localhost:3000")
    reset_link = f"{base_url}/auth/reset-password?token={token}"
    html = f"<p>Вы запросили сброс пароля.</p><p><a href='{reset_link}'>Сбросить пароль</a></p>"

    try:
        cfg = await load_mail_config(session)
        await send_mail(cfg, payload.email, "Сброс пароля", html, text=f"Ссылка: {reset_link}")
    except Exception as e:
        # раньше было: pass — это и скрывало реальную ошибку
        logger.exception("Failed to send reset password email to %s", payload.email)
        # (по желанию) сохранить событие в таблицу notifications с статусом error

    return {"ok": True, "message": "Если такой email существует, мы отправили письмо со ссылкой на сброс."}

class ResetPasswordIn(BaseModel):
    token: str
    new_password: constr(min_length=8)

@router.post("/password/reset")
async def reset_password(payload: ResetPasswordIn, session: AsyncSession = Depends(get_session)):
    # 1) найти валидный токен
    t: EmailToken | None = (await session.execute(
        select(EmailToken)
        .where(
            EmailToken.token == payload.token,
            EmailToken.purpose == EmailTokenPurpose.reset,
            EmailToken.used_at.is_(None),
        )
    )).scalar_one_or_none()

    if not t:
        raise HTTPException(status_code=400, detail="invalid_token")
    if t.expires_at and dt_datetime.now(timezone.utc) > t.expires_at:
        raise HTTPException(status_code=400, detail="token_expired")

    # 2) обновить пароль в AuthLocal
    await session.execute(
        update(AuthLocal)
        .where(AuthLocal.user_id == t.user_id)
        .values(password_hash=bcrypt.hash(payload.new_password), must_change_password=False)
    )

    # 3) пометить токен использованным
    t.used_at = dt_datetime.now(timezone.utc)
    await session.commit()

    return {"ok": True, "message": "Пароль обновлён. Теперь можно войти с новым паролем."}



@app.post("/admin/settings/mail/test", tags=["admin"])
async def test_mail(
    payload: dict = Body(...),
    user = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """
    Тест SMTP-рассылки:
    - принимает { "to": "<email>" }
    - возвращает структурированный ответ: { ok, kind, message, details? }
      kind: success | auth | connect | smtp | unknown | bad_request
    """
    to = payload.get("to")
    if not to:
        return JSONResponse(
            {"ok": False, "kind": "bad_request", "message": "Поле 'to' обязательно"},
            status_code=200
        )

    # ГЛАВНОЕ ИСПРАВЛЕНИЕ: берём конфиг из БД через сессию
    cfg = await load_mail_config(session)

    html = "<p>Тест рассылки</p>"
    try:
        await send_mail(cfg, to, "Тест рассылки", html, text="Тест рассылки OK")
        return {"ok": True, "kind": "success", "message": "Тестовое письмо отправлено"}
    except SMTPAuthenticationError as e:
        return {"ok": False, "kind": "auth", "message": "Ошибка аутентификации SMTP. Проверьте логин/пароль.", "details": str(e)}
    except (SMTPConnectError, asyncio.TimeoutError, TimeoutError, socket.gaierror, ConnectionRefusedError, OSError) as e:
        return {"ok": False, "kind": "connect", "message": "Нет соединения с SMTP-сервером (порт/фаервол/DNS).", "details": str(e)}
    except SMTPResponseException as e:
        return {"ok": False, "kind": "smtp", "message": f"SMTP ошибка {getattr(e, 'code', '')}", "details": str(e)}
    except SMTPException as e:
        return {"ok": False, "kind": "smtp", "message": "SMTP исключение", "details": str(e)}
    except Exception as e:
        return {"ok": False, "kind": "unknown", "message": "Неизвестная ошибка отправки", "details": str(e)}


    
# =========================
#           ADMIN UI
# =========================
# ДОЛЖНО быть последним: инициализация sqladmin
from src.api.admin import init_admin  # noqa: E402
app.include_router(router)
init_admin(app)
