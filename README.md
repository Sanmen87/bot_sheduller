# CRM Schedule Bot — MVP


## Быстрый старт


1. Скопируйте `.env.example` → `.env` и задайте TELEGRAM_BOT_TOKEN.
2. `docker-compose up -d --build`
3. Инициализируйте Alembic:
- `docker-compose exec api alembic init src/db/migrations`
- пропишите путь к моделям и URL в `alembic.ini`
- `make revision && make migrate`
4. Проверьте API: http://localhost:8000/health
5. Запустите бота: уже поднят контейнер `bot` (по умолчанию polling). Для webhook настроить nginx и переменные.