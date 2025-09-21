import os, json, re, logging, asyncio
from aiogram import Bot, Dispatcher, F
from aiogram.types import Message, Update, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from aiogram.filters import Command, CommandStart
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# ── ENV ──────────────────────────────
load_dotenv()
def require_env(name: str) -> str:
    v = os.getenv(name, "").strip()
    if not v:
        raise RuntimeError(f"{name} is not set")
    return v

BOT_TOKEN        = require_env("TELEGRAM_BOT_TOKEN")
DB_URL           = require_env("DATABASE_URL")     # postgresql+psycopg://user:pass@db:5432/db
USERS_TABLE      = os.getenv("USERS_TABLE", "users").strip() or "users"
USERNAME_JOINER  = os.getenv("USERNAME_JOINER", " ")
REG_FORM_URL     = require_env("REG_FORM_URL")     # например: https://sarov.space/register

# рядом с чтением ENV
RAW_JOINER = os.getenv("USERNAME_JOINER", " ")
USERNAME_JOINER = RAW_JOINER if RAW_JOINER != "" else " "

def make_username(first_name: str, last_name: str) -> str:
    # пробел гарантирован даже при пустом env
    return f"{first_name}{USERNAME_JOINER}{last_name}".strip()

# ── LOGGING ──────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(name)s | %(message)s")
logging.getLogger("aiogram").setLevel(logging.INFO)

def _mask_db_url(url: str) -> str:
    try:
        if "://" not in url: return url
        head, tail = url.split("://", 1)
        if "@" in tail and ":" in tail.split("@",1)[0]:
            user = tail.split("@",1)[0].split(":",1)[0]
            host = tail.split("@",1)[1]
            return f"{head}://{user}:***@{host}"
        return url
    except Exception:
        return url

logging.info("DATABASE_URL: %s", _mask_db_url(DB_URL))
logging.info("USERS_TABLE: %s", USERS_TABLE)
logging.info("REG_FORM_URL: %s", REG_FORM_URL)

# ── DB (psycopg / SQLAlchemy sync) ───
engine = create_engine(DB_URL, echo=False, pool_pre_ping=True, future=True)

UPSERT_USER_SQL = text(f"""
INSERT INTO {USERS_TABLE} (
  telegram_id, role, first_name, last_name, username, phone, email, is_verified
) VALUES (
  :telegram_id, 'client', :first_name, :last_name, :username, :phone, :email, FALSE
)
ON CONFLICT (telegram_id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name  = EXCLUDED.last_name,
  username   = EXCLUDED.username,
  phone      = EXCLUDED.phone,
  email      = EXCLUDED.email;
""")

def upsert_user_sync(payload: dict, tg_id: int):
    with engine.begin() as conn:
        conn.execute(UPSERT_USER_SQL, {
            "telegram_id": tg_id,
            "first_name": payload["first_name"],
            "last_name":  payload["last_name"],
            "username":   payload["username"],
            "phone":      payload.get("phone"),
            "email":      payload.get("email"),
        })

async def upsert_user(payload: dict, tg_id: int):
    await asyncio.to_thread(upsert_user_sync, payload, tg_id)

# ── validators / utils ───────────────
PHONE_RE = re.compile(r"^[+]?\d[\d\s\-()]{7,}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

def make_username(first_name: str, last_name: str) -> str:
    return f"{first_name}{USERNAME_JOINER}{last_name}".strip()

# ── BOT ──────────────────────────────
# если тебе сейчас ничего больше от роутера не нужно — можно не подключать его вовсе:
# from src.bot.routers.registration_webapp import router as reg_router

async def main():
    bot = Bot(BOT_TOKEN)
    dp = Dispatcher()

    # Если нужны другие роутеры/хендлеры из твоего файла — подключай.
    # dp.include_router(reg_router)

    # /start с web_app-кнопкой (без nonce, чтобы не зависеть от роутера)
    @dp.message(CommandStart())
    async def cmd_start(m: Message):
        url = f"{REG_FORM_URL.rstrip('/')}/"  # слэш, чтобы не было редиректа, теряющего query
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="📝 Регистрация", web_app=WebAppInfo(url=url))]
        ])
        await m.answer("Нажмите «Регистрация», чтобы открыть форму.", reply_markup=kb)

    @dp.message(Command("help"))
    @dp.message(F.text.casefold() == "помощь")
    async def help_cmd(m: Message):
        await m.answer("Доступно: /start — открыть форму регистрации.")

    @dp.update()
    async def log_any(update: Update):
        logging.debug("RAW UPDATE: %s", update.model_dump_json())

    # Приём данных из WebApp и запись в БД
    @dp.message(F.web_app_data)
    async def handle_webapp_data(m: Message):
        logging.warning("WEB_APP_DATA: %s", m.web_app_data.data)
        try:
            data = json.loads(m.web_app_data.data)
        except Exception:
            logging.exception("Bad web_app_data JSON")
            return await m.answer("❌ Не удалось прочитать данные формы.")

        fam   = str(data.get("first_name", "")).strip()  # фамилия
        name  = str(data.get("last_name", "")).strip()   # имя
        phone = (data.get("phone") or "").strip() or None
        email = (data.get("email") or "").strip() or None
        if not fam or not name:
            return await m.answer("❌ Заполните фамилию и имя.")
        if phone and not PHONE_RE.match(phone):
            return await m.answer("❌ Телефон в неверном формате.")
        if email and not EMAIL_RE.match(email):
            return await m.answer("❌ Email в неверном формате.")

        payload = {
            "first_name": fam,
            "last_name":  name,
            "username":   make_username(fam, name),
            "phone":      phone,
            "email":      email,
        }

        try:
            await upsert_user(payload, m.from_user.id)
            logging.info("UPSERT OK: tg_id=%s fam=%s name=%s phone=%s email=%s",
                         m.from_user.id, fam, name, phone, email)
        except Exception:
            logging.exception("DB UPSERT failed")
            return await m.answer("❌ Ошибка сохранения в базе")

        await m.answer(f"✅ Регистрация сохранена!\nФамилия: {fam}\nИмя: {name}\nUsername: {payload['username']}")

    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
