"""Testar hela Google-kopplingsvägen mot en KÖRANDE server (t.ex. Pi:n) över HTTP —
ingen SSH eller DB-åtkomst behövs, så den kan köras varifrån som helst på nätet.

Loggar in som en riktig användare, öppnar (eller skriver ut) /connect-länken,
och pollar /status tills OAuth-utbytet landat — samma flöde som knappen i
Inställningar → Kopplingar gör i webbläsaren, fast från terminalen.

Körs manuellt:
    python -m scripts.test_google_oauth_pi --host http://192.168.0.121:8420 --username patrik
    python -m scripts.test_google_oauth_pi --host http://192.168.0.121:8420 --username patrik --disconnect-after
"""
import argparse
import getpass
import sys
import time
import webbrowser

import httpx


def login(host: str, username: str, password: str) -> str:
    resp = httpx.post(f"{host}/api/auth/login", json={"username": username, "password": password}, timeout=10)
    if resp.status_code != 200:
        print(f"Inloggning fallerade: {resp.status_code} {resp.text}")
        raise SystemExit(1)
    return resp.json()["token"]


def get_status(host: str, token: str) -> dict:
    resp = httpx.get(
        f"{host}/api/integrations/google/status",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True, help="t.ex. http://192.168.0.121:8420")
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", help="frågas interaktivt om den utelämnas")
    parser.add_argument("--timeout", type=int, default=180, help="sekunder att vänta på att koppling slutförs")
    parser.add_argument("--no-open-browser", action="store_true", help="skriv bara ut länken, öppna den inte")
    parser.add_argument("--disconnect-after", action="store_true", help="koppla från igen när testet är klart")
    args = parser.parse_args()

    host = args.host.rstrip("/")
    password = args.password or getpass.getpass(f"Lösenord för {args.username}: ")

    print(f"Loggar in som {args.username} på {host}...")
    token = login(host, args.username, password)

    status = get_status(host, token)
    if status["connected"]:
        print(f"Redan kopplat sedan {status['connected_at']}.")
        if not args.disconnect_after:
            print("Kör med --disconnect-after om du vill koppla från och testa om från början.")
            return 0
    else:
        connect_url = f"{host}/api/integrations/google/connect?token={token}"
        print(f"\nInte kopplat än. Öppna för att godkänna:\n  {connect_url}\n")
        if not args.no_open_browser:
            webbrowser.open(connect_url)

        print(f"Väntar upp till {args.timeout}s på att kopplingen slutförs...")
        deadline = time.monotonic() + args.timeout
        while time.monotonic() < deadline:
            status = get_status(host, token)
            if status["connected"]:
                print(f"Kopplat ✓ ({status['connected_at']})")
                break
            time.sleep(3)
        else:
            print("Tidsgränsen nådd — kopplingen slutfördes aldrig. Kolla serverloggen (journalctl -u varv -f).")
            return 1

    if args.disconnect_after:
        print("Kopplar från igen (--disconnect-after)...")
        httpx.delete(
            f"{host}/api/integrations/google", headers={"Authorization": f"Bearer {token}"}, timeout=10,
        ).raise_for_status()
        after = get_status(host, token)
        print("Bortkopplat ✓" if not after["connected"] else "Fick inte bort kopplingen — kolla manuellt.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
