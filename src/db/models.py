# src/db/models.py
from __future__ import annotations

from datetime import date as dt_date, time as dt_time
import enum

from sqlalchemy import (
    String,
    Integer,
    Text,
    ForeignKey,
    Enum,
    Date,
    Time,
    Boolean,
    UniqueConstraint,
)
from sqlalchemy import DateTime  
from datetime import datetime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


# ===== Base =====
class Base(DeclarativeBase):
    pass


# ===== ENUMs =====
class UserRole(str, enum.Enum):
    guest = "guest"
    client = "client"
    teacher = "teacher"
    admin = "admin"


class SlotStatus(str, enum.Enum):
    available = "available"
    booked = "booked"
    canceled = "canceled"
    hidden = "hidden"
    tentative = "tentative"  # на будущее


class BookingStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    canceled = "canceled"

class LessonType(str, enum.Enum):
    individual = "individual"
    group = "group"


# ===== Tables =====
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(unique=True, nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole), default=UserRole.guest, nullable=False
    )
    first_name: Mapped[str | None] = mapped_column(String(120))
    last_name: Mapped[str | None] = mapped_column(String(120))
    username: Mapped[str | None] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(64))
    email: Mapped[str | None] = mapped_column(String(256))
    is_verified: Mapped[bool] = mapped_column(default=False)

    # 1:1 к Teacher
    teacher: Mapped["Teacher"] = relationship(back_populates="user", uselist=False)

    # (опционально) удобная навигация из пользователя к его бронированиям
    bookings: Mapped[list["Booking"]] = relationship(
        back_populates="client", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} tg={self.telegram_id} role={self.role}>"


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str | None] = mapped_column(String(64), unique=True)

    # связи с преподами через связующую таблицу
    teachers: Mapped[list["TeacherSubject"]] = relationship(
        back_populates="subject", cascade="all, delete-orphan"
    )

    # удобная связь на слоты по предмету
    time_slots: Mapped[list["TimeSlot"]] = relationship(
        back_populates="subject", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Subject id={self.id} name={self.name!r}>"


class Teacher(Base):
    __tablename__ = "teachers"

    id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    bio: Mapped[str | None] = mapped_column(Text)
    default_mode: Mapped[str | None] = mapped_column(String(16))  # online/offline/mixed

    user: Mapped[User] = relationship(back_populates="teacher")

    subjects: Mapped[list["TeacherSubject"]] = relationship(
        back_populates="teacher", cascade="all, delete-orphan"
    )

    # удобная связь на слоты преподавателя
    time_slots: Mapped[list["TimeSlot"]] = relationship(
        back_populates="teacher", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Teacher id={self.id}>"


class TeacherSubject(Base):
    __tablename__ = "teacher_subjects"
    __table_args__ = (
        UniqueConstraint("teacher_id", "subject_id", name="uq_teacher_subject"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    teacher_id: Mapped[int] = mapped_column(
        ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False
    )
    subject_id: Mapped[int] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False
    )

    teacher: Mapped[Teacher] = relationship(back_populates="subjects")
    subject: Mapped[Subject] = relationship(back_populates="teachers")

    def __repr__(self) -> str:
        return f"<TeacherSubject t={self.teacher_id} s={self.subject_id}>"


class TimeSlot(Base):
    __tablename__ = "time_slots"

    id: Mapped[int] = mapped_column(primary_key=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.id"), nullable=False)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"), nullable=False)

    date: Mapped[dt_date] = mapped_column(Date, nullable=False)
    start_time: Mapped[dt_time] = mapped_column(Time, nullable=False)
    end_time: Mapped[dt_time] = mapped_column(Time, nullable=False)

    mode: Mapped[str | None] = mapped_column(String(16))  # 'online' | 'offline'
    lesson_type: Mapped[LessonType] = mapped_column(
        Enum(LessonType), default=LessonType.individual, nullable=False
    )
    capacity: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[SlotStatus] = mapped_column(
        Enum(SlotStatus), default=SlotStatus.available, nullable=False
    )

    # relations
    teacher: Mapped["Teacher"] = relationship(back_populates="time_slots")
    subject: Mapped["Subject"] = relationship(back_populates="time_slots")
    bookings: Mapped[list["Booking"]] = relationship(
        back_populates="slot", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return (
            f"<TimeSlot id={self.id} t={self.teacher_id} s={self.subject_id} "
            f"{self.date} {self.start_time}-{self.end_time} "
            f"type={self.lesson_type} status={self.status}>"
        )


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(primary_key=True)
    slot_id: Mapped[int] = mapped_column(
        ForeignKey("time_slots.id", ondelete="CASCADE"), nullable=False
    )
    client_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[BookingStatus] = mapped_column(
        Enum(BookingStatus), default=BookingStatus.pending, nullable=False
    )

    # relations для админки/удобства
    slot: Mapped[TimeSlot] = relationship(back_populates="bookings")
    client: Mapped[User] = relationship(back_populates="bookings")

    def __repr__(self) -> str:
        return f"<Booking id={self.id} slot={self.slot_id} client={self.client_id} status={self.status}>"
    
class Setting(Base):
    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (UniqueConstraint("key", name="uq_settings_key"),)

class AuthLocal(Base):
    __tablename__ = "auth_local"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    email: Mapped[str] = mapped_column(String(256), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
    user: Mapped["User"] = relationship()

class EmailTokenPurpose(str, enum.Enum):
    verify = "verify"
    reset = "reset"

class EmailToken(Base):
    __tablename__ = "email_tokens"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    purpose: Mapped[EmailTokenPurpose] = mapped_column(Enum(EmailTokenPurpose), nullable=False)
    token: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))