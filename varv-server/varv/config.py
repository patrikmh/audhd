"""Central konfiguration. Allt läses från miljövariabler / .env — inga hemligheter i kod."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="VARV_", extra="ignore")

    # --- databas ---
    database_url: str = "sqlite:///./varv.db"  # byt till postgresql+psycopg://... på Pi:n vid behov

    # --- agenter ---
    agent_model: str = "openrouter:anthropic/claude-sonnet-5"
    # För lokal inferens via LM Studio: agent_model="openai:qwen3-..." + OPENAI_BASE_URL i miljön.
    breakdown_daily_budget: int = 3          # Nedbrytaren: max auto-nedbrytningar per dag
    refine_max_attempts: int = 3             # Förfinaren: max försök per idé
    refine_batch: int = 2                    # Förfinaren: idéer per tick
    agent_tick_seconds: int = 300            # bakgrundsloopens intervall

    # --- transkribering (web API med lokal fallback) ---
    openai_api_key: str | None = None    # OPENAI_API_KEY för web-transkribering
    whisper_model: str = "KBLab/kb-whisper-tiny"  # fallback: lokal modell
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"       # int8 = Pi-vänligt

    # --- BERTopic ---
    topics_min_docs: int = 30                # kör inte klustring på för lite data
    topics_hour: int = 3                     # nattjobbets timme (lokal tid)
    embedding_model: str = "paraphrase-multilingual-MiniLM-L12-v2"  # sv+en blandat

    # --- API ---
    # Auth är nu per användare (User.token, se varv/api/auth.py) — inte längre en enda delad nyckel.
    cors_origins: list[str] = ["*"]          # snäva åt när PWA:ns origin är känd


@lru_cache
def get_settings() -> Settings:
    return Settings()
