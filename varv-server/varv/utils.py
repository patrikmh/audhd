"""UUIDv7: tidsordnade, klientgenererbara id:n — grunden för offline-synk.

Egen implementation (10 rader) istället för beroende: RFC 9562-layout,
48 bitar unix-ms + slump. Sorterbar som sträng ⇒ index-vänlig i SQLite/Postgres.
"""
import os
import time


def uuid7() -> str:
    ts = int(time.time() * 1000)
    b = bytearray(ts.to_bytes(6, "big") + os.urandom(10))
    b[6] = (b[6] & 0x0F) | 0x70  # version 7
    b[8] = (b[8] & 0x3F) | 0x80  # variant
    h = b.hex()
    return f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"
