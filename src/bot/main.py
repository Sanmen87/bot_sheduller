# src/bot/main.py
import os
import asyncio
import logging
from aiogram import Bot, Dispatcher, F
from aiogram.types import Message, Update   # ← ЭТО ВАЖНО
from aiogram.filters import Command
from dotenv import load_dotenv

from src.bot.routers.registration_webapp import router as reg_router

def require_env(name: str) -> str:
    val = os.getenv(name, "").strip()
    if not val:
        raise RuntimeError(f"{name} is not set")
    return val

async def main():
    load_dotenv()
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    )

    bot = Bot(require_env("TELEGRAM_BOT_TOKEN"))
    dp = Dispatcher()
    dp.include_router(reg_router)

    @dp.message(F.text.casefold() == "помощь")
    async def help_cmd(message: Message):
        await message.answer("Пока умею немного. Скоро добавим запись и опрос учителей.")

    # Логируем ВСЕ апдейты (увидим web_app_data)
    @dp.update()
    async def log_any(update: Update):
        logging.debug("RAW UPDATE: %s", update.model_dump_json())

    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
