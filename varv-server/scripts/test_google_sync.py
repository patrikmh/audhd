"""Manuell koll: kan vi prata med Google Calendar/Gmail för en given användares koppling?

Läs-bara — skapar INGA fångster och skriver inget till databasen, så den kan
köras om och om igen utan att dubbelfånga något. Bra för att verifiera en
nyss gjord Inställningar → Kopplingar-koppling innan man litar på den
riktiga timvisa synken.

Körs manuellt:
    python -m scripts.test_google_sync <användarnamn>
"""
import asyncio
import sys

import httpx
from sqlmodel import Session, select

from varv.config import get_settings
from varv.db.engine import engine
from varv.db.models import GoogleAccount, User
from varv.services.google_sync import _fetch_calendar_events, _fetch_gmail_messages, _header, _refresh_access_token


async def main(username: str) -> int:
    s = get_settings()
    if not (s.google_client_id and s.google_client_secret):
        print("Saknar VARV_GOOGLE_CLIENT_ID/VARV_GOOGLE_CLIENT_SECRET — fyll i .env först.")
        return 1

    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == username)).first()
        if not user:
            print(f"Ingen användare heter {username!r}.")
            return 1
        account = session.get(GoogleAccount, user.id)
        if not account:
            print(f"{username} har inte kopplat sitt Google-konto än (Inställningar → Kopplingar).")
            return 1
        refresh_token = account.refresh_token

    async with httpx.AsyncClient(timeout=15) as client:
        print("Byter refresh-token mot access-token...")
        try:
            access_token = await _refresh_access_token(client, refresh_token)
        except httpx.HTTPStatusError as exc:
            print(f"Tokenbyte fallerade: {exc.response.status_code} {exc.response.text}")
            return 1
        print("OK — access-token hämtad.\n")

        print("Kalenderhändelser (nästa 24h):")
        try:
            events = await _fetch_calendar_events(client, access_token)
        except httpx.HTTPStatusError as exc:
            print(f"Kalender-anropet fallerade: {exc.response.status_code} {exc.response.text}")
            return 1
        if not events:
            print("  (inga)")
        for event in events:
            start = event.get("start", {}).get("dateTime") or event.get("start", {}).get("date", "?")
            print(f"  📅 {event.get('summary', '(ingen titel)')} — {start}  [id={event.get('id')}]")

        print(f"\nGmail ({s.google_gmail_query!r}):")
        try:
            messages = await _fetch_gmail_messages(client, access_token)
        except httpx.HTTPStatusError as exc:
            print(f"Gmail-anropet fallerade: {exc.response.status_code} {exc.response.text}")
            return 1
        if not messages:
            print("  (inga)")
        for msg in messages:
            subject = _header(msg, "Subject") or "(inget ämne)"
            from_ = _header(msg, "From") or "okänd avsändare"
            print(f"  ✉️ {subject} — {from_}  [id={msg.get('id')}]")

    print("\nOvanstående är exakt vad nästa timvisa synk skulle fånga (ingen fångst skapad nu).")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Användning: python -m scripts.test_google_sync <användarnamn>")
        raise SystemExit(1)
    raise SystemExit(asyncio.run(main(sys.argv[1])))
