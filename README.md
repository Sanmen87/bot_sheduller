# CRM Schedule Bot

Система управления расписанием и записями на дополнительные занятия.  
Включает телеграм-бота для клиентов и преподавателей, backend-API, web-панель администратора и воркеры для задач.

## Возможности
- Ежедневный опрос учителей о доступных слотах.
- Просмотр и бронирование слотов клиентами.
- Напоминания и уведомления (Telegram).
- Управление пользователями и учителями (админ).
- Отчёты и экспорт (CSV/PDF).
- Web-интерфейс для администраторов и координаторов.

Полное техническое задание см. в [`Document 2.pdf`](./Document%202.pdf).

## Архитектура
- **Telegram Bot**: Aiogram 3  
- **API**: FastAPI + SQLAlchemy + Pydantic  
- **DB**: PostgreSQL 15 (через Alembic миграции)  
- **Очереди и планировщик**: Redis 7 + Celery  
- **Web UI (админ-панель)**: Next.js + Tailwind + shadcn/ui  
- **Контейнеризация**: Docker Compose  

## Структура
src/api # FastAPI backend (слоты, брони, отчёты, auth)
src/bot # Telegram бот (aiogram)
src/web # Web-admin (Next.js)
src/worker # Celery worker + задачи
src/db # Модели и миграции Alembic



Бот поднимается как отдельный контейнер (bot). По умолчанию режим polling.

Компоненты
API (src/api)
REST-эндпоинты: /slots, /bookings, /teachers, /subjects, /reports/*.
Авторизация: JWT в httpOnly cookie. RBAC (admin/teacher/client).

Бот (src/bot)
Обработка команд /start, опрос учителей, бронирование клиентами.

Web Admin (src/web)

Календарь слотов (FullCalendar).

Таблицы бронирований.

CRUD учителей и предметов.

Отчёты.

Worker (src/worker)
Асинхронные задачи: напоминания, рассылки, отчёты.

Разработка
Backend: Python 3.11, FastAPI, Alembic.

Frontend: Next.js 14, React 18, Tailwind.

Линтеры: black, ruff, eslint.

Тесты: pytest, httpx.

TODO / Roadmap
Расширенные отчёты (нагрузка, посещаемость).

Поддержка iCal/интеграции с внешними календарями.

Онлайн-оплата и биллинг.

Массовое планирование на 2–3 дня вперёд (см. раздел 22 в ТЗ).