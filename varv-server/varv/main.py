"""Varv-servern. Start: uvicorn varv.main:app --host 0.0.0.0 --port 8420"""
import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from varv.api.routes import auth_router, router
from varv.api.ag_ui_routes import router as ag_ui_router
from varv.config import get_settings
from varv.db.engine import init_db
from varv.worker import agent_loop

# Ett enda uvicorn-process + en systemd-tjänst istället för separat nginx/Caddy.
# `npm run build` i frontend/ lägger dist/ som syskon till varv-server/ — matchar
# hur repot redan är strukturerat på både utvecklingsmaskinen och Pi:n.
FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    stop = asyncio.Event()
    task = asyncio.create_task(agent_loop(stop))
    yield
    stop.set()
    await task


app = FastAPI(title="Varv", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router, prefix="/api")
app.include_router(router, prefix="/api")
app.include_router(ag_ui_router, prefix="/api")


@app.get("/health")
def health():
    return {"ok": True}


# Registrerad sist: /api/* och /health matchar routrarna ovan i tur och ordning
# innan Starlette faller tillbaka på den här mounten. Om frontend/dist saknas
# (t.ex. innan första `npm run build`, eller i test-/CI-miljöer) hoppar vi bara
# över mounten istället för att krascha vid import.
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
