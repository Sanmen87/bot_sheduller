# tasks.py
from .celery_app import celery_app


@celery_app.task
def send_notification(user_id: int, text: str):
# TODO: интеграция с Telegram (бот) / Email
return {"sent": True, "user_id": user_id}