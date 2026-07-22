"""Google-synk: kalenderhändelser och prioriterad gmail blir fångster, en gång i timmen.

Per-användare-OAuth: refresh_token kommer från GoogleAccount (kopplad via
Inställningar → Kopplingar, se api/google_routes.py), inte från miljön.
Samma väg in som allt annat: process_capture(). Dedup via GoogleSyncedItem.
"""
import logging
from datetime import datetime, timedelta, timezone

import httpx
from sqlmodel import Session, select

from varv.config import get_settings
from varv.db.models import GoogleSyncedItem
from varv.schemas import CaptureIn
from varv.services.capture import process_capture

log = logging.getLogger(__name__)

_TOKEN_URL = "https://oauth2.googleapis.com/token"
_CALENDAR_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
_GMAIL_LIST_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
_GMAIL_MSG_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}"


async def _refresh_access_token(client: httpx.AsyncClient, refresh_token: str) -> str:
    s = get_settings()
    resp = await client.post(
        _TOKEN_URL,
        json={
            "client_id": s.google_client_id,
            "client_secret": s.google_client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


async def _fetch_calendar_events(client: httpx.AsyncClient, access_token: str) -> list[dict]:
    now = datetime.now(timezone.utc)
    resp = await client.get(
        _CALENDAR_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        params={
            "timeMin": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "timeMax": (now + timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "singleEvents": "true",
            "orderBy": "startTime",
        },
    )
    resp.raise_for_status()
    return resp.json().get("items", [])


async def _fetch_gmail_messages(client: httpx.AsyncClient, access_token: str) -> list[dict]:
    s = get_settings()
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = await client.get(_GMAIL_LIST_URL, headers=headers, params={"q": s.google_gmail_query, "maxResults": 25})
    resp.raise_for_status()
    ids = [m["id"] for m in resp.json().get("messages", [])]

    messages = []
    for msg_id in ids:
        detail = await client.get(
            _GMAIL_MSG_URL.format(id=msg_id), headers=headers, params={"format": "metadata"},
        )
        detail.raise_for_status()
        messages.append(detail.json())
    return messages


def _header(payload: dict, name: str) -> str:
    for h in payload.get("payload", {}).get("headers", []):
        if h.get("name") == name:
            return h.get("value", "")
    return ""


def _already_captured(session: Session, user_id: str, kind: str, external_id: str) -> bool:
    existing = session.exec(
        select(GoogleSyncedItem).where(
            GoogleSyncedItem.user_id == user_id,
            GoogleSyncedItem.kind == kind,
            GoogleSyncedItem.external_id == external_id,
        )
    ).first()
    return existing is not None


def _mark_captured(session: Session, user_id: str, kind: str, external_id: str) -> None:
    session.add(GoogleSyncedItem(user_id=user_id, kind=kind, external_id=external_id))
    session.commit()


async def google_sync_sweep(session: Session, user_id: str, refresh_token: str) -> None:
    async with httpx.AsyncClient(timeout=15) as client:
        access_token = await _refresh_access_token(client, refresh_token)

        events = await _fetch_calendar_events(client, access_token)
        for event in events:
            event_id = event.get("id")
            if not event_id or _already_captured(session, user_id, "calendar", event_id):
                continue
            try:
                start = event.get("start", {}).get("dateTime") or event.get("start", {}).get("date", "")
                summary = event.get("summary", "(ingen titel)")
                raw = f"📅 {summary} — {start}"
                await process_capture(session, user_id, CaptureIn(raw=raw, source="calendar"))
            except Exception:
                log.exception("google_sync: kunde inte fånga kalenderhändelse %s", event_id)
                continue
            _mark_captured(session, user_id, "calendar", event_id)

        messages = await _fetch_gmail_messages(client, access_token)
        for msg in messages:
            msg_id = msg.get("id")
            if not msg_id or _already_captured(session, user_id, "gmail", msg_id):
                continue
            try:
                subject = _header(msg, "Subject") or "(inget ämne)"
                from_ = _header(msg, "From") or "okänd avsändare"
                raw = f"✉️ {subject} — {from_}"
                await process_capture(session, user_id, CaptureIn(raw=raw, source="gmail"))
            except Exception:
                log.exception("google_sync: kunde inte fånga mejl %s", msg_id)
                continue
            _mark_captured(session, user_id, "gmail", msg_id)
