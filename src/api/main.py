from fastapi import FastAPI, Depends
from sqlalchemy.ext.asyncio import AsyncSession

# если используешь get_session:
try:
    from src.db.session import get_session  # noqa
except Exception:
    # временная заглушка, чтобы health работал даже без БД
    async def get_session():
        yield None

app = FastAPI(title="Schedule API")

@app.get("/health")
async def health():
    return {"ok": True}

@app.get("/slots")
async def list_slots(
    subject_id: int | None = None,
    date: str | None = None,
    session: AsyncSession | None = Depends(get_session),
):
    # TODO: выбрать свободные слоты (status=available)
    return []

@app.post("/bookings")
async def create_booking(
    payload: dict,
    session: AsyncSession | None = Depends(get_session),
):
    # TODO: создать бронь с проверками
    return {"status": "created"}
