import os, json, re, secrets, logging, asyncio
from typing import Optional

from aiogram import Router, F
from aiogram.filters import CommandStart, Command
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo

from dotenv import load_dotenv

# SQLAlchemy (SYNC)
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

load_dotenv()

REG_FORM_URL    = os.getenv("REG_FORM_URL", "")
DB_URL          = os.getenv("DATABASE_URL", "")  # postgresql+psycopg://user:pass@host:5432/db
USERNAME_JOINER = os.getenv("USERNAME_JOINER", " ")
USERS_TABLE     = os.getenv("USERS_TABLE", "users")
NONCE_TTL       = int(os.getenv("NONCE_TTL_SECONDS", "300"))

if not REG_FORM_URL:
    raise RuntimeError("REG_FORM_URL must be set (e.g. https://sarov.space/register)")
if not DB_URL:
    raise RuntimeError("DATABASE_URL must be set (postgresql+psycopg://...)")

# ---------- SYNC engine/session (psycopg) ----------
engine = create_engine(DB_URL, echo=False, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

# ---------- SQL ----------
CREATE_USERS_SQL = text(f"""
CREATE TABLE IF NOT EXISTS {USERS_TABLE}(
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,  -- фамилия
  last_name  TEXT NOT NULL,  -- имя
  username   TEXT NOT NULL,
  phone      TEXT,
  email      TEXT
);
""")

UPSERT_USER_SQL = text(f"""
INSERT INTO {USERS_TABLE} (telegram_id, first_name, last_name, username, phone, email)
VALUES (:telegram_id, :first_name, :last_name, :username, :phone, :email)
ON CONFLICT (telegram_id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name  = EXCLUDED.last_name,
  username   = EXCLUDED.username,
  phone      = EXCLUDED.phone,
  email      = EXCLUDED.email;
""")

CREATE_NONCE_SQL = text("""
CREATE TABLE IF NOT EXISTS webapp_nonces(
  nonce TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
""")

CLEAN_NONCE_SQL = text("DELETE FROM webapp_nonces WHERE created_at < now() - INTERVAL '1 hour'")
INSERT_NONCE_SQL = text("INSERT INTO webapp_nonces (nonce, user_id) VALUES (:n, :u)")
SELECT_NONCE_SQL = text("SELECT user_id FROM webapp_nonces WHERE nonce=:n")
DELETE_NONCE_SQL = text("DELETE FROM webapp_nonces WHERE nonce=:n")

# ---------- Helpers ----------
PHONE_RE = re.compile(r"^[+]?\d[\d\s\-()]{7,}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

def make_username(first_name: str, last_name: str) -> str:
    return f"{first_name}{USERNAME_JOINER}{last_name}".strip()

def _ensure_schema_sync():
    with engine.begin() as conn:
        conn.execute(CREATE_USERS_SQL)
        conn.execute(CREATE_NONCE_SQL)

async def ensure_schema():
    await asyncio.to_thread(_ensure_schema_sync)

def _nonce_new_sync(user_id: int) -> str:
    n = secrets.token_urlsafe(24)
    with engine.begin() as conn:
        conn.execute(CLEAN_NONCE_SQL)
        conn.execute(INSERT_NONCE_SQL, {"n": n, "u": user_id})
    return n

async def nonce_new(user_id: int) -> str:
    return await asyncio.to_thread(_nonce_new_sync, user_id)

def _nonce_check_and_consume_sync(nonce: str, user_id: int) -> bool:
    with engine.begin() as conn:
        row = conn.execute(SELECT_NONCE_SQL, {"n": nonce}).first()
        if not row:
            return False
        conn.execute(DELETE_NONCE_SQL, {"n": nonce})
        return int(row.user_id) == int(user_id)

async def nonce_check_and_consume(nonce: str, user_id: int) -> bool:
    return await asyncio.to_thread(_nonce_check_and_consume_sync, nonce, user_id)

def _upsert_user_sync(tg_id: int, fam: str, name: str, uname: str,
                      phone: Optional[str], email: Optional[str]) -> None:
    with engine.begin() as conn:
        conn.execute(
            UPSERT_USER_SQL,
            {
                "telegram_id": tg_id,
                "first_name": fam,
                "last_name":  name,
                "username":   uname,
                "phone":      phone,
                "email":      email,
            }
        )

async def upsert_user(tg_id: int, fam: str, name: str, uname: str,
                      phone: Optional[str], email: Optional[str]) -> None:
    await asyncio.to_thread(_upsert_user_sync, tg_id, fam, name, uname, phone, email)

# ---------- Router ----------
router = Router(name="registration_webapp_psycopg")

@router.message(CommandStart())
async def start(m: Message):
    await ensure_schema()
    n = await nonce_new(m.from_user.id)
    url = f"{REG_FORM_URL}?n={n}"
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📝 Регистрация", web_app=WebAppInfo(url=url))]
    ])
    await m.answer("Нажмите «Регистрация», чтобы открыть форму.", reply_markup=kb)

@router.message(Command("register"))
async def register(m: Message):
    await start(m)

@router.message(F.web_app_data)
async def on_webapp_data(m: Message):
    logging.info("WEB_APP_DATA from %s: %s", m.from_user.id, m.web_app_data.data)
    try:
        data = json.loads(m.web_app_data.data)
    except Exception:
        logging.exception("Bad web_app_data JSON")
        return await m.answer("❌ Не удалось прочитать данные формы.")

    # nonce обязателен: форма открывалась как ...?n=<nonce>
    nonce = str(data.get("nonce") or "")
    if not nonce or not (await nonce_check_and_consume(nonce, m.from_user.id)):
        return await m.answer("❌ Сессия формы недействительна. Откройте форму заново (/register).")

    # поля (по вашему требованию: first_name=Фамилия, last_name=Имя)
    fam   = str(data.get("first_name", "")).strip()
    name  = str(data.get("last_name", "")).strip()
    phone = (str(data.get("phone") or "").strip()) or None
    email = (str(data.get("email") or "").strip()) or None

    if not fam or not name:
        return await m.answer("❌ Заполните фамилию и имя.")
    if phone and not PHONE_RE.match(phone):
        return await m.answer("❌ Телефон в неверном формате.")
    if email and not EMAIL_RE.match(email):
        return await m.answer("❌ Email в неверном формате.")

    uname = make_username(fam, name)
    tg_id = int(m.from_user.id)  # доверяем только Telegram

    try:
        await upsert_user(tg_id, fam, name, uname, phone, email)
        logging.info("User upsert OK: tg_id=%s fam=%s name=%s", tg_id, fam, name)
    except Exception:
        logging.exception("DB upsert failed")
        return await m.answer("❌ Ошибка сохранения в базе. Проверь логи бота.")

    await m.answer(
        "✅ Регистрация сохранена\n"
        f"Фамилия: {fam}\nИмя: {name}\nUsername: {uname}"
    )
