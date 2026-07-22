"""Google OAuth: koppla/koppla från kalender + gmail per användare, från Inställningar.

GET    /api/integrations/google/connect   — startar OAuth-utbytet, redirectar till Google
GET    /api/integrations/google/callback  — Google landar här med en kod, byter mot refresh-token
GET    /api/integrations/google/status    — är kontot kopplat?
DELETE /api/integrations/google           — koppla från

Webbläsarens redirect till Google kan inte bära en Authorization-header, så /connect
tar token som query-param istället och binder den till en kortlivad state-rad
(GoogleOAuthState) som callbacken slår upp för att veta vilken användare det gäller.

redirect_uri räknas ut DYNAMISKT från requesten (samma host/port besökaren faktiskt
använde) istället för ett hårdkodat värde i .env — så samma deploy funkar oavsett om
appen nås via IP, ett Tailscale-namn eller localhost i dev. Google kräver ändå att
den exakta URI:n är registrerad som "Authorized redirect URI" i Cloud Console —
lägg till en rad per sätt ni faktiskt når servern på.
"""
import logging
import secrets
from datetime import timedelta
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlmodel import Session, select

from varv.api.auth import current_user
from varv.config import get_settings
from varv.db.engine import get_session
from varv.db.models import GoogleAccount, GoogleOAuthState, User, utcnow
from varv.schemas import GoogleStatusOut

log = logging.getLogger(__name__)
router = APIRouter(prefix="/integrations/google")

_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_SCOPES = " ".join([
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
])
_STATE_TTL = timedelta(minutes=10)


def _require_google_config() -> None:
    s = get_settings()
    if not (s.google_client_id and s.google_client_secret):
        raise HTTPException(status_code=503, detail="Google-koppling är inte konfigurerad på servern")


@router.get("/connect")
def connect(token: str, request: Request, session: Session = Depends(get_session)) -> RedirectResponse:
    _require_google_config()
    s = get_settings()
    user = session.exec(select(User).where(User.token == token)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Ogiltig token")

    redirect_uri = str(request.url_for("google_oauth_callback"))
    state = secrets.token_urlsafe(32)
    session.add(GoogleOAuthState(state=state, user_id=user.id, redirect_uri=redirect_uri))
    session.commit()

    params = {
        "client_id": s.google_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "access_type": "offline",
        "prompt": "consent",
        "scope": _SCOPES,
        "state": state,
    }
    return RedirectResponse(f"{_AUTH_URL}?{urlencode(params)}")


@router.get("/callback", name="google_oauth_callback")
async def callback(code: str | None = None, state: str | None = None, error: str | None = None,
                    session: Session = Depends(get_session)) -> RedirectResponse:
    if error or not code or not state:
        return RedirectResponse("/?google=error")

    pending = session.get(GoogleOAuthState, state)
    # SQLite tappar tidszonen vid rundtripp — jämför naivt (båda sidor är redan UTC).
    if not pending or utcnow().replace(tzinfo=None) - pending.created_at.replace(tzinfo=None) > _STATE_TTL:
        if pending:
            session.delete(pending)
            session.commit()
        return RedirectResponse("/?google=error")

    user_id = pending.user_id
    redirect_uri = pending.redirect_uri  # måste vara IDENTISK med den som skickades i /connect
    session.delete(pending)
    session.commit()

    s = get_settings()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(_TOKEN_URL, data={
            "client_id": s.google_client_id,
            "client_secret": s.google_client_secret,
            "redirect_uri": redirect_uri,
            "code": code,
            "grant_type": "authorization_code",
        })
    if resp.status_code != 200:
        log.error("google callback: tokenbyte fallerade %s %s", resp.status_code, resp.text)
        return RedirectResponse("/?google=error")

    payload = resp.json()
    refresh_token = payload.get("refresh_token")
    if not refresh_token:
        # Google skickar bara refresh_token vid FÖRSTA samtycket om inte prompt=consent
        # tvingar fram det varje gång — vi sätter access_type=offline+prompt=consent i /connect,
        # men om kontot ändå saknar det (t.ex. redan återkallat) måste användaren koppla om.
        log.error("google callback: inget refresh_token i svaret för user_id=%s", user_id)
        return RedirectResponse("/?google=error")

    existing = session.get(GoogleAccount, user_id)
    if existing:
        existing.refresh_token = refresh_token
        existing.scope = payload.get("scope")
        existing.connected_at = utcnow()
    else:
        session.add(GoogleAccount(user_id=user_id, refresh_token=refresh_token, scope=payload.get("scope")))
    session.commit()

    return RedirectResponse("/?google=connected")


@router.get("/status", response_model=GoogleStatusOut)
def status(user: User = Depends(current_user), session: Session = Depends(get_session)) -> GoogleStatusOut:
    account = session.get(GoogleAccount, user.id)
    if not account:
        return GoogleStatusOut(connected=False)
    return GoogleStatusOut(connected=True, connected_at=account.connected_at.isoformat())


@router.delete("")
def disconnect(user: User = Depends(current_user), session: Session = Depends(get_session)) -> dict:
    account = session.get(GoogleAccount, user.id)
    if account:
        session.delete(account)
        session.commit()
    return {"ok": True}
