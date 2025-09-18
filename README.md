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

TO DO
API:
В ТЗ предусмотрена таблица settings (ключ/значение) для системных параметров.
Мы можем добавить эндпоинты:

GET /admin/settings — список всех настроек (slot_duration_min, reminder_minutes_before, breaks и др.).

PUT /admin/settings — изменение значений (только admin).

Для предметов у нас уже есть subjects + teacher_subjects.

GET /subjects, POST /subjects, DELETE /subjects/{id} — CRUD по предметам.

Логика «один учитель = несколько предметов» уже есть: отдельная таблица teacher_subjects с teacher_id, subject_id, UNIQUE(teacher_id,subject_id). То есть да, один учитель может вести несколько разных предметов.

Фронтенд (web-admin):
Добавляется страница /settings:

Поле для изменения длины слота (минуты).

Список «перерывов» (например, массив интервалов, которые система вычитает при нарезке).

Управление предметами: таблица с добавлением и удалением.

Все формы защищены: только admin может редактировать.

Таким образом:

длина слота и перерывы → глобальные настройки в settings.

предметы → отдельный справочник subjects.

связь учителей и предметов → через teacher_subjects, поддерживает множественные связи (учитель → несколько предметов).