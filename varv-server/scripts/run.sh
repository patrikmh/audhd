#!/usr/bin/env bash
# Sätter upp och startar varv-server lokalt, backend = OpenRouter.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# Hitta en Python >= 3.11 oavsett vad OS:et råkar kalla den (python3.11,
# python3.12, eller bara python3 om distron redan är ny nog).
PYTHON_BIN=""
for candidate in python3.13 python3.12 python3.11 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    if "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
      PYTHON_BIN="$candidate"
      break
    fi
  fi
done
if [ -z "$PYTHON_BIN" ]; then
  echo "Hittade ingen Python >= 3.11. Installera en (t.ex. 'sudo apt install python3.11 python3.11-venv') och kör om." >&2
  exit 1
fi
echo "==> Använder $PYTHON_BIN ($($PYTHON_BIN --version))"

if [ ! -d .venv ]; then
  echo "==> Skapar venv (.venv)"
  "$PYTHON_BIN" -m venv .venv
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

echo "==> Skapar/uppdaterar användare patrik + pernilla (lösenord: pass123)"
python -m scripts.create_user patrik pass123
python -m scripts.create_user pernilla pass123

echo "==> Startar uvicorn på :8420"
exec uvicorn varv.main:app --host 0.0.0.0 --port 8420 --reload
