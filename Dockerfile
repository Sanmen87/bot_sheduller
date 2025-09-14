# Dockerfile (корень проекта)
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_NO_CACHE_DIR=off

WORKDIR /app

# Системные пакеты (минимум; расширим при необходимости)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl && \
    rm -rf /var/lib/apt/lists/*

# Устанавливаем зависимости отдельно для кеширования
COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r requirements.txt

# Копируем исходники
COPY src /app/src

# Команда по умолчанию (переопределяется в docker-compose)
CMD ["python", "-c", "print('image ready')"]