"""Auth: bärar-token per användare. Varje användare har sin egen token,
utfärdad vid inloggning (/api/auth/login) — se varv/utils.py för hashning.

I drift: kör hela Pi:n bakom Tailscale ändå — tokenen är bältet till hängslena.
"""
from fastapi import Depends, Header, HTTPException
from sqlmodel import Session, select

from varv.db.engine import get_session
from varv.db.models import User


def current_user(authorization: str | None = Header(default=None), session: Session = Depends(get_session)) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Saknar token")
    token = authorization.removeprefix("Bearer ")
    user = session.exec(select(User).where(User.token == token)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Ogiltig token")
    return user
