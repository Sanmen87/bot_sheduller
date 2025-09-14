from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import String, Integer, Text, ForeignKey, Enum, Date, Time, Boolean
import enum


class Base(DeclarativeBase):
pass


class UserRole(str, enum.Enum):
guest = 'guest'
client = 'client'
teacher = 'teacher'
admin = 'admin'


class SlotStatus(str, enum.Enum):
available = 'available'
booked = 'booked'
canceled = 'canceled'
hidden = 'hidden'
tentative = 'tentative'


class BookingStatus(str, enum.Enum):
pending = 'pending'
confirmed = 'confirmed'
canceled = 'canceled'


class User(Base):
__tablename__ = 'users'
id: Mapped[int] = mapped_column(primary_key=True)
telegram_id: Mapped[int] = mapped_column(unique=True, nullable=False)
role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.guest)
first_name: Mapped[str | None] = mapped_column(String(120))
last_name: Mapped[str | None] = mapped_column(String(120))
username: Mapped[str | None] = mapped_column(String(120))
phone: Mapped[str | None] = mapped_column(String(64))
email: Mapped[str | None] = mapped_column(String(256))
is_verified: Mapped[bool] = mapped_column(default=False)


class Subject(Base):
__tablename__ = 'subjects'
id: Mapped[int] = mapped_column(primary_key=True)
name: Mapped[str] = mapped_column(Text, nullable=False)
code: Mapped[str | None] = mapped_column(String(64), unique=True)


class Teacher(Base):
__tablename__ = 'teachers'
id: Mapped[int] = mapped_column(ForeignKey('users.id'), primary_key=True)
bio: Mapped[str | None] = mapped_column(Text)
default_mode: Mapped[str | None] = mapped_column(String(16)) # online/offline/mixed


class TimeSlot(Base):
__tablename__ = 'time_slots'
id: Mapped[int] = mapped_column(primary_key=True)
teacher_id: Mapped[int] = mapped_column(ForeignKey('teachers.id'))
subject_id: Mapped[int] = mapped_column(ForeignKey('subjects.id'))
date: Mapped[Date] = mapped_column(Date, nullable=False)
start_time: Mapped[Time] = mapped_column(Time, nullable=False)
end_time: Mapped[Time] = mapped_column(Time, nullable=False)
mode: Mapped[str | None] = mapped_column(String(16)) # online/offline
capacity: Mapped[int] = mapped_column(Integer, default=1)
status: Mapped[SlotStatus] = mapped_column(Enum(SlotStatus), default=SlotStatus.available)


class Booking(Base):
__tablename__ = 'bookings'
id: Mapped[int] = mapped_column(primary_key=True)
slot_id: Mapped[int] = mapped_column(ForeignKey('time_slots.id', ondelete='CASCADE'))
client_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
status: Mapped[BookingStatus] = mapped_column(Enum(BookingStatus), default=BookingStatus.pending)