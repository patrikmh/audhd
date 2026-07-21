"""UUIDv7: tidsordnade, klientgenererbara id:n — grunden för offline-synk.

Egen implementation (10 rader) istället för beroende: RFC 9562-layout,
48 bitar unix-ms + slump. Sorterbar som sträng ⇒ index-vänlig i SQLite/Postgres.
"""
import hashlib
import hmac
import os
import secrets
import time


def uuid7() -> str:
    ts = int(time.time() * 1000)
    b = bytearray(ts.to_bytes(6, "big") + os.urandom(10))
    b[6] = (b[6] & 0x0F) | 0x70  # version 7
    b[8] = (b[8] & 0x3F) | 0x80  # variant
    h = b.hex()
    return f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


# ---------- lösenord & sessionstoken ----------
# PBKDF2-HMAC-SHA256, inget extra beroende (passlib etc.) för en tvåpersonersapp.

def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 200_000).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    salt, _, digest = stored.partition("$")
    if not digest:
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 200_000).hex()
    return hmac.compare_digest(candidate, digest)


def new_token() -> str:
    return secrets.token_urlsafe(32)
