# src/api/admin.py
import os
from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request
from markupsafe import Markup
from sqlalchemy import select, create_engine
from sqlalchemy.orm import Session

from src.db.models import User, Teacher, Subject, TimeSlot, Booking


def _badge(text: str, color: str) -> Markup:
    return Markup(f'<span class="badge bg-{color}">{text}</span>')


def _lookup(session: Session, model, key="id", val="name"):
    return {
        k: v
        for k, v in session.execute(
            select(getattr(model, key), getattr(model, val))
        ).all()
    }


# --- отдельный sync-движок для админки ---
DB_URL = os.getenv("DATABASE_URL", "")
SYNC_URL = (
    DB_URL.replace("+asyncpg", "+psycopg")
         .replace("+psycopg_async", "+psycopg")
)
admin_engine = create_engine(SYNC_URL, pool_pre_ping=True)


class SimpleAuth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        form = await request.form()
        email = form.get("username")
        password = form.get("password")
        if email == os.getenv("ADMIN_EMAIL") and password == os.getenv("ADMIN_PASSWORD"):
            request.session.update({"token": "ok"})
            return True
        return False

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        return request.session.get("token") == "ok"


auth_backend = SimpleAuth(secret_key=os.getenv("SECRET_KEY", "dev-secret"))


# =========================
#         VIEWS
# =========================
class UserAdmin(ModelView, model=User):
    column_list = [
        User.id,
        User.telegram_id,
        User.role,
        User.first_name,
        User.username,
        User.is_verified,
    ]
    column_searchable_list = [User.first_name, User.last_name, User.username, User.email]
    column_filters = [User.role, User.is_verified]
    can_delete = False


class TeacherAdmin(ModelView, model=Teacher):
    column_list = [Teacher.id, Teacher.default_mode, Teacher.bio]


class SubjectAdmin(ModelView, model=Subject):
    column_list = [Subject.id, Subject.name, Subject.code]
    column_searchable_list = [Subject.name, Subject.code]


class TimeSlotAdmin(ModelView, model=TimeSlot):
    # используем связи, а не *_id
    column_list = [
        TimeSlot.id,
        TimeSlot.teacher,
        TimeSlot.subject,
        TimeSlot.date,
        TimeSlot.start_time,
        TimeSlot.end_time,
        TimeSlot.capacity,
        TimeSlot.status,
        TimeSlot.mode,
    ]
    column_labels = {"teacher": "Teacher", "subject": "Subject"}
    column_filters = [TimeSlot.date, TimeSlot.status, TimeSlot.mode]
    column_sortable_list = [TimeSlot.date, TimeSlot.start_time, TimeSlot.id]
    column_default_sort = [(TimeSlot.date, True), (TimeSlot.start_time, True)]

    column_formatters = {
        TimeSlot.start_time: lambda m, a: m.start_time.strftime("%H:%M"),
        TimeSlot.end_time: lambda m, a: m.end_time.strftime("%H:%M"),
        TimeSlot.status: lambda m, a: _badge(
            getattr(m.status, "value", str(m.status)),
            {
                "available": "success",
                "hidden": "secondary",
                "canceled": "danger",
                "booked": "warning",
                "tentative": "info",
            }.get(getattr(m.status, "value", str(m.status)), "secondary"),
        ),
        TimeSlot.mode: lambda m, a: _badge(str(m.mode or "-"), "info"),
    }

    # ВАЖНО: для relationship-полей НЕ указываем "model", только "fields"
    form_ajax_refs = {
        "teacher": {"fields": ("id",)},            # teacher.user.first_name можно вывести в шаблонах
        "subject": {"fields": ("name", "code")},
    }


class BookingAdmin(ModelView, model=Booking):
    column_list = [Booking.id, Booking.slot, Booking.client, Booking.status]
    column_labels = {"slot": "Slot", "client": "Client"}
    column_filters = [Booking.status]
    column_default_sort = [(Booking.id, True)]

    column_formatters = {
        Booking.status: lambda m, a: _badge(
            getattr(m.status, "value", str(m.status)),
            {
                "pending": "warning",
                "confirmed": "success",
                "canceled": "secondary",
            }.get(getattr(m.status, "value", str(m.status)), "secondary"),
        )
    }

    # relationship-поля → без "model"
    form_ajax_refs = {
        "slot": {"fields": ("id",)},
        "client": {"fields": ("first_name", "username", "email")},
    }


def init_admin(app):
    """
    Инициализатор админки. Вызывайте из main.py:  init_admin(app)
    """
    admin = Admin(app, admin_engine, authentication_backend=auth_backend)
    admin.add_view(UserAdmin)
    admin.add_view(TeacherAdmin)
    admin.add_view(SubjectAdmin)
    admin.add_view(TimeSlotAdmin)
    admin.add_view(BookingAdmin)
    return admin
