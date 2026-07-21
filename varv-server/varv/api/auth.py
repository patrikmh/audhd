"""Auth: enkel bearer-token för en-användar-API. Tom token = av (LAN-utveckling).

I drift: sätt VARV_API_TOKEN och kör hela Pi:n bakom Tailscale — då är trafiken
krypterad och nätet privat utan portöppningar; tokenen är bältet till hängslena.
"""
from fastapi import Header, HTTPException

from varv.config import get_settings


def require_token(authorization: str | None = Header(default=None)) -> None:
    token = get_settings().api_token
    if not token:
        return
    if authorization != f"Bearer {token}":
        raise HTTPException(status_code=401, detail="Ogiltig eller saknad token")
