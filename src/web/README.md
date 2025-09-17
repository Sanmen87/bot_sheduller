# CRM Schedule — Web UI (внутри src/web)


## Быстрый старт


```bash
cp ../../.env.example ../../.env # или создайте NEXT_PUBLIC_API_BASE_URL
# DEV (горячая перезагрузка)
docker compose up web-dev # http://localhost:5173


# PROD-like (статическая сборка + nginx)
docker compose build web && docker compose up web # http://localhost:5173
```


## Интеграция с API
- Авторизация: `fetch(..., { credentials: 'include' })` — бэкенд ставит httpOnly cookie.
- Пагинация: читаем `X-Total-Count` (экспортирован в CORS).
- Фильтры `mode`, `lesson_type` учтены в `/slots`.
- Экспорт CSV: прямая ссылка на `/bookings/export.csv`.


## TODO
- RBAC в UI (скрывать админские части по роли из `/auth/me`).
- Формы создания/редактирования слотов и учителей.
- Улучшить таблицы (сортировки, пагинация).
- Стилизацию (shadcn/ui), локализация дат.