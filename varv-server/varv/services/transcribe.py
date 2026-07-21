"""Web transcription via OpenAI Whisper API. Fast and excellent quality for Swedish.

Requires: OPENAI_API_KEY in environment.
Falls back to local faster-whisper if API key not set.
"""
import logging
import tempfile
from functools import lru_cache
from pathlib import Path

import httpx

from varv.config import get_settings
from varv.schemas import TranscriptOut

log = logging.getLogger(__name__)

OPENAI_API_URL = "https://api.openai.com/v1/audio/transcriptions"


def transcribe_bytes(audio: bytes, suffix: str = ".webm", language: str | None = None) -> TranscriptOut:
    """Transcribe audio via OpenAI Whisper API. language: ISO 639-1 code."""
    s = get_settings()
    
    # Try web API first if API key is available
    if s.openai_api_key:
        try:
            return _transcribe_openai(audio, suffix, language, s.openai_api_key)
        except Exception as e:
            log.warning("OpenAI API failed, falling back to local: %s", e)
    
    # Fallback to local
    return _transcribe_local(audio, suffix, language)


def _transcribe_openai(audio: bytes, suffix: str, language: str | None, api_key: str) -> TranscriptOut:
    """Transcribe via OpenAI Whisper API."""
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(audio)
        path = Path(f.name)
    try:
        with open(path, "rb") as audio_file:
            files = {"file": (f"audio{suffix}", audio_file, "audio/octet-stream")}
            data = {
                "model": "whisper-1",
                "response_format": "verbose_json",
            }
            if language:
                data["language"] = language
            
            headers = {"Authorization": f"Bearer {api_key}"}
            response = httpx.post(OPENAI_API_URL, headers=headers, files=files, data=data, timeout=30)
            response.raise_for_status()
            
            result = response.json()
            return TranscriptOut(
                text=result["text"].strip(),
                language=result.get("language", language or "sv"),
                duration_s=round(result.get("duration", 0), 1),
            )
    finally:
        path.unlink(missing_ok=True)


def _transcribe_local(audio: bytes, suffix: str, language: str | None) -> TranscriptOut:
    """Fallback: local faster-whisper."""
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(audio)
        path = Path(f.name)
    try:
        segments, info = _model().transcribe(str(path), beam_size=1, vad_filter=True, language=language)
        text = " ".join(seg.text.strip() for seg in segments).strip()
        return TranscriptOut(text=text, language=info.language, duration_s=round(info.duration, 1))
    finally:
        path.unlink(missing_ok=True)


@lru_cache(maxsize=1)
def _model():
    """Lazy-load local whisper model (only used as fallback)."""
    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        raise RuntimeError('faster-whisper not installed — need OPENAI_API_KEY for web transcription') from e
    s = get_settings()
    log.info("Loading local model %s (%s/%s) as fallback…", s.whisper_model, s.whisper_device, s.whisper_compute_type)
    return WhisperModel(s.whisper_model, device=s.whisper_device, compute_type=s.whisper_compute_type)
