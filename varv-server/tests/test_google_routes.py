"""Google OAuth-routerna: connect/callback/status/disconnect.

Ingen riktig Google-trafik — /connect testas via redirect-URL:en den bygger,
/callback via en fejkad httpx.AsyncClient som svarar som tokenendpointen skulle.
"""
from collections.abc import Iterator
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from varv.api import google_routes
from varv.config import Settings
from varv.db.engine import get_session
from varv.db.models import GoogleAccount, GoogleOAuthState, ShoppingList, User
from varv.services import google_sync
from varv.utils import hash_password, new_token

FAKE_SETTINGS = Settings(
    google_client_id="fake-client-id",
    google_client_secret="fake-client-secret",
)


@pytest.fixture
def client(monkeypatch) -> Iterator[tuple[TestClient, Session, str]]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_connection, connection_record):
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        token = new_token()
        user = User(username="test", password_hash=hash_password("test"), token=token)
        session.add(user)
        session.flush()
        session.add(ShoppingList(user_id=user.id, name="Inköp", slug="shopping"))
        session.commit()
        session.refresh(user)

        monkeypatch.setattr(google_routes, "get_settings", lambda: FAKE_SETTINGS)

        import varv.main as main_module

        def use_test_session() -> Iterator[Session]:
            yield session

        main_module.app.dependency_overrides[get_session] = use_test_session
        test_client = TestClient(main_module.app)
        try:
            yield test_client, session, token
        finally:
            test_client.close()
            main_module.app.dependency_overrides.clear()

    engine.dispose()


def test_connect_without_google_config_returns_503(client, monkeypatch):
    test_client, _, token = client
    monkeypatch.setattr(google_routes, "get_settings", lambda: Settings())

    response = test_client.get(f"/api/integrations/google/connect?token={token}", follow_redirects=False)

    assert response.status_code == 503


def test_connect_with_invalid_token_is_rejected(client):
    test_client, _, _ = client

    response = test_client.get("/api/integrations/google/connect?token=not-a-real-token", follow_redirects=False)

    assert response.status_code == 401


def test_connect_redirects_to_google_and_records_pending_state(client):
    test_client, session, token = client

    response = test_client.get(f"/api/integrations/google/connect?token={token}", follow_redirects=False)

    assert response.status_code == 307
    location = urlparse(response.headers["location"])
    assert location.netloc == "accounts.google.com"
    params = parse_qs(location.query)
    assert params["client_id"] == ["fake-client-id"]
    assert params["access_type"] == ["offline"]
    assert params["prompt"] == ["consent"]
    assert "calendar.readonly" in params["scope"][0]
    assert "gmail.readonly" in params["scope"][0]
    # dynamiskt uträknad från requesten (TestClient default-host), inte hårdkodad i settings
    assert params["redirect_uri"] == ["http://testserver/api/integrations/google/callback"]

    state_value = params["state"][0]
    pending = session.get(GoogleOAuthState, state_value)
    assert pending is not None
    assert pending.redirect_uri == "http://testserver/api/integrations/google/callback"
    user = session.exec(select(User).where(User.token == token)).first()
    assert pending.user_id == user.id


def test_callback_with_unknown_state_redirects_with_error(client):
    test_client, _, _ = client

    response = test_client.get(
        "/api/integrations/google/callback?code=abc&state=never-issued", follow_redirects=False,
    )

    assert response.status_code == 307
    assert response.headers["location"] == "/?google=error"


def test_callback_when_google_reports_an_error_redirects_with_error(client):
    test_client, _, _ = client

    response = test_client.get("/api/integrations/google/callback?error=access_denied", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "/?google=error"


class _FakeTokenResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload
        self.text = str(payload)

    def json(self):
        return self._payload


class _FakeAsyncClient:
    def __init__(self, response: _FakeTokenResponse):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, *args, **kwargs):
        return self._response


def test_callback_exchanges_code_and_stores_refresh_token(client, monkeypatch):
    test_client, session, token = client
    user = session.exec(select(User).where(User.token == token)).first()

    connect_resp = test_client.get(f"/api/integrations/google/connect?token={token}", follow_redirects=False)
    state_value = parse_qs(urlparse(connect_resp.headers["location"]).query)["state"][0]

    fake_response = _FakeTokenResponse(200, {"refresh_token": "rt-123", "scope": "calendar gmail"})
    monkeypatch.setattr(google_routes.httpx, "AsyncClient", lambda **kw: _FakeAsyncClient(fake_response))

    response = test_client.get(
        f"/api/integrations/google/callback?code=auth-code&state={state_value}", follow_redirects=False,
    )

    assert response.status_code == 307
    assert response.headers["location"] == "/?google=connected"

    account = session.get(GoogleAccount, user.id)
    assert account is not None
    assert account.refresh_token == "rt-123"
    # engångsstaten ska vara förbrukad, inte återanvändbar
    assert session.get(GoogleOAuthState, state_value) is None


def test_callback_without_refresh_token_in_response_redirects_with_error(client, monkeypatch):
    test_client, session, token = client

    connect_resp = test_client.get(f"/api/integrations/google/connect?token={token}", follow_redirects=False)
    state_value = parse_qs(urlparse(connect_resp.headers["location"]).query)["state"][0]

    fake_response = _FakeTokenResponse(200, {"scope": "calendar gmail"})  # inget refresh_token
    monkeypatch.setattr(google_routes.httpx, "AsyncClient", lambda **kw: _FakeAsyncClient(fake_response))

    response = test_client.get(
        f"/api/integrations/google/callback?code=auth-code&state={state_value}", follow_redirects=False,
    )

    assert response.headers["location"] == "/?google=error"


def test_status_and_disconnect_round_trip(client):
    test_client, session, token = client
    user = session.exec(select(User).where(User.token == token)).first()
    headers = {"Authorization": f"Bearer {token}"}

    assert test_client.get("/api/integrations/google/status", headers=headers).json() == {
        "connected": False, "connected_at": None,
    }

    session.add(GoogleAccount(user_id=user.id, refresh_token="rt-abc"))
    session.commit()

    status = test_client.get("/api/integrations/google/status", headers=headers).json()
    assert status["connected"] is True
    assert status["connected_at"] is not None

    disconnect = test_client.delete("/api/integrations/google", headers=headers)
    assert disconnect.status_code == 200
    assert session.get(GoogleAccount, user.id) is None

    assert test_client.get("/api/integrations/google/status", headers=headers).json()["connected"] is False


def test_disconnect_without_a_connected_account_is_a_no_op(client):
    test_client, _, token = client

    response = test_client.delete("/api/integrations/google", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_sweep_skips_already_captured_items_on_a_second_run(session, monkeypatch):
    async def fake_refresh(client, refresh_token):
        return "fake-access-token"

    async def fake_calendar(client, access_token):
        return [{"id": "evt-1", "summary": "Möte", "start": {"dateTime": "2026-07-23T10:00:00Z"}}]

    async def fake_gmail(client, access_token):
        return []

    monkeypatch.setattr(google_sync, "_refresh_access_token", fake_refresh)
    monkeypatch.setattr(google_sync, "_fetch_calendar_events", fake_calendar)
    monkeypatch.setattr(google_sync, "_fetch_gmail_messages", fake_gmail)

    from pydantic_ai.models.test import TestModel
    from varv.agents.core import sorteraren

    with sorteraren.override(model=TestModel()):
        await google_sync.google_sync_sweep(session, session.user_id, "rt-doesnt-matter")
        await google_sync.google_sync_sweep(session, session.user_id, "rt-doesnt-matter")

    from varv.db.models import Capture
    captures = session.exec(select(Capture).where(Capture.source == "calendar")).all()
    assert len(captures) == 1  # andra svepet dedupar mot GoogleSyncedItem, fångar inte samma event igen
