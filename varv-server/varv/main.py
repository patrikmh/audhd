"""Varv-servern. Start: uvicorn varv.main:app --host 0.0.0.0 --port 8420"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from varv.api.routes import auth_router, router
from varv.config import get_settings
from varv.db.engine import init_db
from varv.worker import agent_loop

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


@app.get("/health")
def health():
    return {"ok": True}
