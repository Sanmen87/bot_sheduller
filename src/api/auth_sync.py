# src/api/auth_sync.py
from __future__ import annotations

import os
import secrets
from datetime import datetime as dt_datetime, timedelta, timezone

from sqlalchemy import select, update, delete
from passlib.hash import bcrypt

from src.db.session import AsyncSession
from src.db.models import User, AuthLocal, EmailToken, EmailTokenPurpose, UserRole
from src.services.mail_config import load_mail_config
from src.services.mailer import send_mail


ELIGIBLE_ROLES = {UserRole.admin, UserRole.teacher}


async def sync_auth_local(session: AsyncSession, user_id: int, send_set_password_email: bool = True) -> None:
    """
    Синхронизация локной учётки с User:
    - Если user.role ∈ {admin, teacher} И user.is_verified И user.email — upsert в auth_local.
      Если запись создаётся впервые → must_change_password=True и отправляем письмо «Задать пароль».
    - Если не подходит — удаляем запись из auth_local (если была).
    - Если поменялся email — обновляем его в auth_local.
    """
    # ── читаем пользователя
    user: User | None = (await session.execute(
        select(User).where(User.id == user_id)
    )).scalar_one_or_none()
    if not user:
        return

    # ── читаем существующую локную запись
    auth: AuthLocal | None = (await session.execute(
        select(AuthLocal).where(AuthLocal.user_id == user_id)
    )).scalar_one_or_none()

    eligible = (user.role in ELIGIBLE_ROLES) and bool(user.is_verified) and bool(user.email)

    # ── если не подходит под локальный логин → удаляем
    if not eligible:
        if auth:
            await session.execute(delete(AuthLocal).where(AuthLocal.user_id == user_id))
            await session.commit()
        return

    # ── если подходит и записи ещё нет → создаём
    if not auth:
        tmp_hash = bcrypt.hash(secrets.token_urlsafe(16))  # временный пароль (всё равно будет заменён)
        auth = AuthLocal(
            user_id=user.id,
            email=user.email,  # type: ignore[arg-type]
            password_hash=tmp_hash,
            is_active=True,
            must_change_password=True,
        )
        session.add(auth)
        await session.flush()

        if send_set_password_email:
            await _send_set_password_email(session, recipient_email=user.email, user_id=user.id)  # type: ignore[arg-type]
        await session.commit()
        return

    # ── запись есть: синхронизируем email/активность
    updates: dict = {}
    if user.email and auth.email != user.email:
        updates["email"] = user.email
    if not auth.is_active:
        updates["is_active"] = True

    if updates:
        await session.execute(
            update(AuthLocal).where(AuthLocal.user_id == user_id).values(**updates)
        )
        await session.commit()


async def _send_set_password_email(session: AsyncSession, recipient_email: str, user_id: int) -> None:
    """Генерирует reset-токен и отправляет письмо со ссылкой на установку пароля."""
    token = secrets.token_urlsafe(48)
    expires_at = dt_datetime.now(timezone.utc) + timedelta(hours=1)

    session.add(EmailToken(
        user_id=user_id,
        purpose=EmailTokenPurpose.reset,  # переиспользуем существующий reset-флоу
        token=token,
        expires_at=expires_at,
    ))
    await session.flush()

    base_url = os.getenv("PUBLIC_WEB_BASE_URL", "http://localhost:3000")
    link = f"{base_url}/auth/reset-password?token={token}"
    html = (
        "<p>Вам выдан доступ в кабинет.</p>"
        f"<p><a href='{link}'>Задать пароль</a> (ссылка активна 1 час)</p>"
    )

    cfg = await load_mail_config(session)
    await send_mail(cfg, recipient_email, "Доступ в кабинет — задайте пароль", html, text=f"Ссылка: {link}")
