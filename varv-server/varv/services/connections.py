"""Idé-till-idé-kopplingar via lokal embedding-likhet.

Medvetet INTE ett LLM-anrop — samma kategori som BERTopic-klustringen
(varv/services/topics.py): en lokal modell som redan körs på Pi:n, ingen
extern agent, därför ingen consent-gate. Beräknas on-demand när idékartan
öppnas snarare än i en bakgrundssvep: antalet idéer är litet nog (personlig
skala) att det är snabbt nog varje gång, och det slipper en
embeddings-tabell som annars kan hamna ur synk när idéer redigeras.
"""
import logging

from sqlmodel import Session, select

from varv.config import get_settings
from varv.db.models import Idea

log = logging.getLogger(__name__)

MIN_SIMILARITY = 0.55
MAX_CONNECTIONS_PER_IDEA = 4


def idea_connections(session: Session, user_id: str) -> list[dict]:
    """Returns [{a, b, score}] — undirected, deduped, capped per idea so a
    generic idea doesn't end up connected to everything (a dense hairball
    is as useless as no graph at all)."""
    ideas = session.exec(
        select(Idea).where(Idea.user_id == user_id, Idea.deleted_at.is_(None))
    ).all()
    if len(ideas) < 2:
        return []

    try:
        from sentence_transformers import SentenceTransformer, util
    except ImportError:
        log.info('idea_connections: sentence-transformers saknas — pip install "varv-server[topics]"')
        return []

    texts = [f"{idea.title or ''}\n{idea.note or idea.raw}".strip() for idea in ideas]
    embedder = SentenceTransformer(get_settings().embedding_model)
    embeddings = embedder.encode(texts, show_progress_bar=False, convert_to_tensor=True)
    sims = util.cos_sim(embeddings, embeddings)

    edges: list[dict] = []
    seen: set[tuple[str, str]] = set()
    # Degree tracked globally, not just per outer-loop pass — otherwise an idea
    # that many *other* ideas independently pick as a top neighbor could still
    # end up connected to everything, defeating the point of the cap.
    degree: dict[str, int] = {idea.id: 0 for idea in ideas}
    for i, idea_a in enumerate(ideas):
        ranked = sorted(range(len(ideas)), key=lambda j: -sims[i][j])
        for j in ranked:
            if j == i:
                continue
            score = float(sims[i][j])
            if score < MIN_SIMILARITY or degree[idea_a.id] >= MAX_CONNECTIONS_PER_IDEA:
                break
            idea_b = ideas[j]
            if degree[idea_b.id] >= MAX_CONNECTIONS_PER_IDEA:
                continue
            pair = tuple(sorted((idea_a.id, idea_b.id)))
            if pair not in seen:
                seen.add(pair)
                edges.append({"a": pair[0], "b": pair[1], "score": round(score, 3)})
                degree[idea_a.id] += 1
                degree[idea_b.id] += 1
    return edges
