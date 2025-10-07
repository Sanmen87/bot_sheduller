# scripts/seed_auth.py
import os, asyncio
from passlib.hash import bcrypt
from sqlalchemy import select, insert, update
from src.db.session import async_session
from src.db.models import User, UserRole, AuthLocal

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").strip()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "").strip()

async def main():
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        raise SystemExit("ADMIN_EMAIL/ADMIN_PASSWORD not set")

    async with async_session() as s:
        # user (admin)
        row = (await s.execute(select(User).where(User.email == ADMIN_EMAIL))).scalars().first()
        if not row:
            res = await s.execute(insert(User).values(
                telegram_id=10_000_000, role=UserRole.admin, first_name="System", last_name="Admin",
                email=ADMIN_EMAIL, is_verified=True
            ).returning(User))
            row = res.scalars().one()
        elif row.role != UserRole.admin:
            await s.execute(update(User).where(User.id == row.id).values(role=UserRole.admin))

        # auth_local
        al = (await s.execute(select(AuthLocal).where(AuthLocal.user_id == row.id))).scalars().first()
        if not al:
            await s.execute(insert(AuthLocal).values(
                user_id=row.id, email=ADMIN_EMAIL, password_hash=bcrypt.hash(ADMIN_PASSWORD)
            ))
        await s.commit()
    print("Seed OK:", ADMIN_EMAIL)

if __name__ == "__main__":
    asyncio.run(main())
