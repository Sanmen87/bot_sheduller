from dataclasses import dataclass
import os
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from src.db.models import Setting

@dataclass
class MailConfig:
    enabled: bool
    from_addr: str
    host: str
    port: int
    user: str
    password: str
    starttls: bool

async def load_mail_config(session: AsyncSession) -> MailConfig:
    # Сначала читаем из БД
    rows = (await session.execute(select(Setting))).scalars().all()
    db_settings = {r.key: r.value for r in rows}

    # Фолбэк на .env
    def get(key: str, default: str = "") -> str:
        return db_settings.get(key) or os.getenv(key, default)

    return MailConfig(
        enabled=get("MAIL_ENABLED", "false").lower() == "true",
        from_addr=get("MAIL_FROM", "noreply@example.com"),
        host=get("MAIL_SMTP_HOST", "smtp.example.com"),
        port=int(get("MAIL_SMTP_PORT", "587")),
        user=get("MAIL_SMTP_USER", ""),
        password=get("MAIL_SMTP_PASSWORD", ""),
        starttls=get("MAIL_SMTP_STARTTLS", "true").lower() == "true",
    )