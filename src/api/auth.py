# src/api/auth.py
from datetime import datetime, timedelta, timezone
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, Request
from fastapi.security import OAuth2PasswordRequestForm
from jose import jwt, JWTError
from pydantic import BaseModel

ALGORITHM = "HS256"
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

router = APIRouter(prefix="/auth", tags=["auth"])

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: int | None = None
    email: Optional[str] = None

class MeOut(BaseModel):
    user_id: int | None = None
    email: Optional[str] = None
    role: str
    expires_at: int  # unix ts

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

def _response_with_cookie(resp: Response, token: str) -> None:
    # httpOnly cookie для web-admin
    resp.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,  # поменяй на True за HTTPS
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )

@router.post("/login", response_model=TokenOut)
def login(
    response: Response,
    form: OAuth2PasswordRequestForm = Depends(),  # принимает username/password
):
    admin_email = os.getenv("ADMIN_EMAIL", "")
    admin_password = os.getenv("ADMIN_PASSWORD", "")
    # MVP: логиним только админа из env (не меняем БД)
    if form.username != admin_email or form.password != admin_password:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    payload = {
        "sub": admin_email,
        "role": "admin",
        "uid": 0,  # системный админ, без связи с БД
    }
    token = create_access_token(payload, timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    _response_with_cookie(response, token)
    return TokenOut(access_token=token, role="admin", user_id=0, email=admin_email)

def get_token_from_request(request: Request) -> Optional[str]:
    # 1) из cookie
    cookie_token = request.cookies.get("access_token")
    if cookie_token:
        return cookie_token
    # 2) из Authorization: Bearer
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return None

def current_user(request: Request) -> MeOut:
    token = get_token_from_request(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        data = decode_token(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    exp = data.get("exp")
    return MeOut(
        user_id=data.get("uid"),
        email=data.get("sub"),
        role=data.get("role", "guest"),
        expires_at=exp or 0,
    )

@router.get("/me", response_model=MeOut)
def me(user: MeOut = Depends(current_user)):
    return user