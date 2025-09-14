import asyncio
import logging
import os
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import Message


TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
logging.basicConfig(level=logging.INFO)


bot = Bot(TOKEN)
dp = Dispatcher()


@dp.message(CommandStart())
async def start(message: Message):
await message.answer(
"Привет! Я бот расписания. Доступные команды: /start, записаться (скоро), мои занятия (скоро)."
)


# Заглушки под роли/хендлеры
@dp.message(F.text.lower() == "помощь")
async def help_cmd(message: Message):
await message.answer("Пока умею немного. Скоро добавим запись и опрос учителей.")


async def main():
await dp.start_polling(bot)


if __name__ == "__main__":
asyncio.run(main())