"""Idea-connection ranking: exercised against a faked sentence-transformers
module (no real model download/inference) so this stays fast and hermetic,
same principle as using TestModel instead of real LLM calls elsewhere."""
import sys
import types

from varv.db.models import Idea
from varv.services.connections import MAX_CONNECTIONS_PER_IDEA, idea_connections


def _install_fake_embedder(monkeypatch, similarity_matrix):
    fake_module = types.ModuleType("sentence_transformers")

    class FakeEmbedder:
        def __init__(self, model_name):
            pass

        def encode(self, texts, show_progress_bar=False, convert_to_tensor=True):
            return texts  # identity — real vectors don't matter, cos_sim is faked below

    class FakeUtil:
        @staticmethod
        def cos_sim(a, b):
            return similarity_matrix

    fake_module.SentenceTransformer = FakeEmbedder
    fake_module.util = FakeUtil
    monkeypatch.setitem(sys.modules, "sentence_transformers", fake_module)


def test_idea_connections_links_similar_ideas_and_skips_unrelated_ones(session, monkeypatch):
    ideas = [Idea(user_id=session.user_id, raw=text) for text in ("a", "b", "c")]
    for idea in ideas:
        session.add(idea)
    session.commit()
    for idea in ideas:
        session.refresh(idea)

    _install_fake_embedder(monkeypatch, [
        [1.0, 0.9, 0.1],
        [0.9, 1.0, 0.1],
        [0.1, 0.1, 1.0],
    ])

    edges = idea_connections(session, session.user_id)

    assert len(edges) == 1  # only the (0, 1) pair clears the similarity threshold
    edge = edges[0]
    assert {edge["a"], edge["b"]} == {ideas[0].id, ideas[1].id}
    assert edge["score"] == 0.9


def test_idea_connections_caps_edges_per_idea(session, monkeypatch):
    n = MAX_CONNECTIONS_PER_IDEA + 3
    ideas = [Idea(user_id=session.user_id, raw=str(i)) for i in range(n)]
    for idea in ideas:
        session.add(idea)
    session.commit()
    for idea in ideas:
        session.refresh(idea)

    # everyone is equally, maximally similar to everyone else
    matrix = [[1.0] * n for _ in range(n)]
    _install_fake_embedder(monkeypatch, matrix)

    edges = idea_connections(session, session.user_id)

    degree = {idea.id: 0 for idea in ideas}
    for edge in edges:
        degree[edge["a"]] += 1
        degree[edge["b"]] += 1
    assert all(d <= MAX_CONNECTIONS_PER_IDEA for d in degree.values())


def test_idea_connections_returns_empty_for_a_single_idea(session):
    session.add(Idea(user_id=session.user_id, raw="lonely idea"))
    session.commit()
    assert idea_connections(session, session.user_id) == []
