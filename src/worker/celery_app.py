# celery_app.py
from celery import Celery
import os


celery_app = Celery(
"schedule",
broker=os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0"),
backend=os.getenv("CELERY_BACKEND_URL", "redis://redis:6379/1"),
)