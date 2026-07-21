"""KB-Whisper via faster-whisper. Lazy-laddning: modellen läses först vid första anropet.

Installeras med:  pip install "varv-server[transcribe]"
kb-whisper-tiny = ~2x faster, kb-whisper-small = bättre kvalitet. Båda slår OpenAI på svenska.
"""
import logging
import tempfile
from functools import lru_cache
from pathlib import Path

from varv.config import get_settings
from varv.schemas import TranscriptOut

log = logging.getLogger(__name__)


# Cache cleared when model changes - delete __pycache__ to force reload
@lru_cache(maxsize=1)
def _model():
    try:
        from faster_whisper import WhisperModel
    except ImportError as e:  # pragma: no cover
        raise RuntimeError('faster-whisper saknas — installera med pip install "varv-server[transcribe]"') from e
    s = get_settings()
    log.info("Laddar %s (%s/%s) …", s.whisper_model, s.whisper_device, s.whisper_compute_type)
    return WhisperModel(s.whisper_model, device=s.whisper_device, compute_type=s.whisper_compute_type)


def transcribe_bytes(audio: bytes, suffix: str = ".webm", language: str | None = None) -> TranscriptOut:
    """language: ISO 639-1-kod (t.ex. "sv"/"en") som hint — annars auto-detekterar Whisper."""
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(audio)
        path = Path(f.name)
    try:
        # beam_size=1 = greedy decode = fastest; vad_filter = skip silence
        segments, info = _model().transcribe(str(path), beam_size=1, vad_filter=True, language=language)
        text = " ".join(seg.text.strip() for seg in segments).strip()
        return TranscriptOut(text=text, language=info.language, duration_s=round(info.duration, 1))
    finally:
        path.unlink(missing_ok=True)
