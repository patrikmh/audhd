"""BERTopic-nattjobbet med PERSISTENT temaidentitet.

Reviewfyndet: full refit varje natt gav nya topic-id ⇒ inga trender. Fixen:
nattens kluster centroid-matchas mot befintliga Topic-rader (cosinus > tröskel
⇒ samma tema behåller sitt id, label och storlek uppdateras). Omatchade gamla
teman lämnas kvar som historik; nya kluster får nya rader.
"""
import json
import logging
from datetime import datetime

from sqlmodel import Session, select

from varv.config import get_settings
from varv.db.models import AgentLog, Capture, KV, Topic

log = logging.getLogger(__name__)

MATCH_THRESHOLD = 0.6


def _cosine(a: list[float], b: list[float]) -> float:
    num = sum(x * y for x, y in zip(a, b))
    da = sum(x * x for x in a) ** 0.5
    db = sum(x * x for x in b) ** 0.5
    return num / (da * db) if da and db else 0.0


def run_topics(session: Session) -> str:
    s = get_settings()
    captures = session.exec(select(Capture).order_by(Capture.created_at.desc()).limit(500)).all()
    docs = [c.raw for c in captures]
    if len(docs) < s.topics_min_docs:
        return f"skip: {len(docs)} fångster < {s.topics_min_docs}"

    try:
        from bertopic import BERTopic
        from sentence_transformers import SentenceTransformer
    except ImportError:
        return 'skip: bertopic saknas — pip install "varv-server[topics]"'

    embedder = SentenceTransformer(s.embedding_model)  # flerspråkig: sv/en blandat
    embeddings = embedder.encode(docs, show_progress_bar=False)
    model = BERTopic(embedding_model=embedder, min_topic_size=3, verbose=False)
    assignments, _ = model.fit_transform(docs, embeddings)

    existing = session.exec(select(Topic).where(Topic.centroid.is_not(None))).all()
    existing_centroids = [(t, json.loads(t.centroid)) for t in existing]

    id_map: dict[int, str] = {}
    matched, created = 0, 0
    for cluster_id in set(assignments):
        if cluster_id == -1:  # BERTopics brus-kluster
            continue
        members = [embeddings[i] for i, a in enumerate(assignments) if a == cluster_id]
        centroid = [float(sum(dim) / len(members)) for dim in zip(*members)]
        words = [w for w, _ in model.get_topic(cluster_id)][:3]
        label = ", ".join(words)
        size = len(members)

        best, best_sim = None, 0.0
        for topic, old_centroid in existing_centroids:
            sim = _cosine(centroid, old_centroid)
            if sim > best_sim:
                best, best_sim = topic, sim

        if best is not None and best_sim >= MATCH_THRESHOLD:
            best.label, best.size, best.centroid = label, size, json.dumps(centroid)
            best.updated_at = datetime.now()
            id_map[cluster_id] = best.id
            existing_centroids = [(t, c) for t, c in existing_centroids if t.id != best.id]  # en match per tema
            matched += 1
        else:
            topic = Topic(label=label, size=size, centroid=json.dumps(centroid))
            session.add(topic)
            session.flush()
            id_map[cluster_id] = topic.id
            created += 1

    for capture, assignment in zip(captures, assignments):
        capture.topic_id = id_map.get(assignment)

    kv = session.get(KV, "topics_last_run")
    stamp = datetime.now().isoformat(timespec="minutes")
    if kv:
        kv.value = stamp
    else:
        session.add(KV(key="topics_last_run", value=stamp))
    session.add(AgentLog(agent="topics", text=f"{len(docs)} fångster → {matched} bevarade + {created} nya teman"))
    session.commit()
    return f"ok: {matched} bevarade, {created} nya"
