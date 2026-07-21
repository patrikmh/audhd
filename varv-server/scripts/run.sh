#!/usr/bin/env bash
# Sätter upp och startar varv-server lokalt, backend = OpenRouter.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -d .venv ]; then
  echo "==> Skapar venv (.venv)"
  python3.11 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "==> Installerar beroenden (fastapi/pydantic-ai/alembic + transcribe/topics/dev)"
pip install -q -e ".[transcribe,topics,dev]"

if [ ! -f .env ]; then
  echo "==> Ingen .env hittades — kopierar .env.example till .env"
  cp .env.example .env
  echo "    Fyll i OPENROUTER_API_KEY i .env och kör om detta skript."
  exit 1
fi

# .env innehåller vanliga miljövariabler (OPENROUTER_API_KEY m.fl.), inte bara
# VARV_-prefixade inställningar. pydantic-settings läser bara de senare, så vi
# måste exportera hela filen till processens miljö själva (samma sak som
# systemd/varv.service gör via EnvironmentFile i drift).
set -a
# shellcheck disable=SC1091
source .env
set +a

if [ -z "${OPENROUTER_API_KEY:-}" ] || [ "$OPENROUTER_API_KEY" = "sk-or-..." ]; then
  echo "OPENROUTER_API_KEY saknas eller är fortfarande platshållarvärdet i .env — fyll i en riktig nyckel." >&2
  exit 1
fi

echo "==> Kör migrationer (alembic upgrade head)"
alembic upgrade head

echo "==> Startar uvicorn på :8420"
exec uvicorn varv.main:app --host 0.0.0.0 --port 8420 --reload
