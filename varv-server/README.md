# Varv-server

Backend till Varv (AuDHD-dagkompanjonen): SQL-databas, Pydantic AI-agenter,
KB-Whisper-transkribering och BERTopic-teman. Byggd för Raspberry Pi 5.

## Struktur
```
varv/
├── config.py        # pydantic-settings — all konfiguration
├── db/
│   ├── models.py    # SQLModel-schema (Pydantic = tabeller)
│   └── engine.py    # motor, sessioner, init + seed
├── schemas.py       # API-DTO:er + agenternas typade outputs
├── agents/core.py   # Sorteraren, Förfinaren, Nedbrytaren (Pydantic AI)
├── services/
│   ├── capture.py   # fångstpipelinen: spara rått → klassa → routa → tagga
│   ├── stats.py     # energi, vecka, topptaggar, kapacitetsregler
│   ├── transcribe.py# KB-Whisper (faster-whisper, lazy)
│   └── topics.py    # BERTopic-nattjobb
├── worker.py        # agentloop i lifespan (svep + nattjobb)
├── api/routes.py    # tunt API-lager
└── main.py          # FastAPI-app
```

## Installation (Pi)
```bash
python3.11 -m venv .venv && source .venv/bin/activate
pip install -e ".[transcribe,topics]"   # eller utan extras för lättvikt
cp .env.example .env                     # fyll i nyckel
uvicorn varv.main:app --host 0.0.0.0 --port 8420
```
Som tjänst: `sudo cp systemd/varv.service /etc/systemd/system/ && sudo systemctl enable --now varv`

## Efter arkitektur-reviewen
- **UUIDv7 överallt** (`varv/utils.py`) — klienter skapar id:n offline
- **Synkprotokoll** `/api/sync/push` + `/api/sync/pull`: LWW per rad, append-only idempotent
- **Auth**: sätt `VARV_API_TOKEN`; kör bakom Tailscale i drift
- **Alembic**: `alembic upgrade head` (framtida ändringar: `alembic revision --autogenerate`)
- **Taggvokabulär** matas in i Sorteraren mot tagg-spretning; injektionshärdade prompts
- **Topic-persistens**: centroid-matchning natt-mot-natt ⇒ stabila topic-id och trender
- **Worker-lease** i KV ⇒ säkert med `--workers > 1`; Whisper körs i executor
- **Tester**: `pytest` (TestModel — inga API-anrop) · **Evals**: `python -m evals.eval_sorteraren`

## Garantier (samma som appen)
1. Fångsten sparas alltid rått innan agenten får röra den.
2. Fallerar Sorteraren → rå idé. Inget försvinner.
3. Auto-kapacitet växlar bara nedåt och aldrig förbi användarens dagsval.

## Testa
```bash
curl -X POST localhost:8420/api/capture -H 'content-type: application/json' \
  -d '{"raw":"ring vet om kattens provsvar imorgon"}'
curl -X POST localhost:8420/api/capture/voice -F file=@memo.webm
curl localhost:8420/api/stats/week
```
