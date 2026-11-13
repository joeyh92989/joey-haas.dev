"""The local-only test sign-in route (#205).

It is an auth bypass by design, so these tests pin the ways it must stay shut:
off unless E2E_TEST_LOGIN is exactly "1", impossible to enable against a
non-localhost FRONTEND_URL, and absent from the app main.py builds otherwise.
"""

from pathlib import Path

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.sessions import SessionMiddleware

from auth import admin_identity
from config import Config, ConfigError, load_config
from e2e_login import create_e2e_login_router, mount_e2e_login
from items import require_admin
from origin_check import add_origin_check
from tests.test_config import COMPLETE

LOCAL = {**COMPLETE, "FRONTEND_URL": "http://localhost:5173"}


def build_app(env):
    """Mirrors main.py's order: session, origin check, then the mount."""
    config = load_config(env)
    app = FastAPI()
    app.add_middleware(
        SessionMiddleware, secret_key=config.session_secret, https_only=True
    )
    add_origin_check(app, [config.frontend_url])
    app.state.admin_identity = admin_identity(config)
    mount_e2e_login(app, config)

    @app.get("/api/guarded", dependencies=[Depends(require_admin)])
    async def guarded():
        return {"ok": True}

    return TestClient(app, base_url="https://testserver")


def test_flag_off_the_route_does_not_exist():
    client = build_app(LOCAL)
    assert client.post("/api/auth/test-login").status_code == 404
    assert client.get("/api/guarded").status_code == 401


def test_flag_on_signs_in_the_admin():
    client = build_app({**LOCAL, "E2E_TEST_LOGIN": "1"})
    assert client.get("/api/guarded").status_code == 401
    response = client.post("/api/auth/test-login")
    assert response.status_code == 204
    assert client.get("/api/guarded").status_code == 200


def test_signs_in_with_the_pinned_sub_when_set():
    client = build_app({**LOCAL, "E2E_TEST_LOGIN": "1", "ADMIN_GOOGLE_SUB": "abc"})
    assert client.post("/api/auth/test-login").status_code == 204
    assert client.get("/api/guarded").status_code == 200


def test_a_foreign_origin_is_refused():
    client = build_app({**LOCAL, "E2E_TEST_LOGIN": "1"})
    response = client.post(
        "/api/auth/test-login", headers={"Origin": "https://evil.example"}
    )
    assert response.status_code == 403
    assert client.get("/api/guarded").status_code == 401


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost.evil.com",
        "http://localhost@evil.com",
        "http://evil.com/?http://localhost",
        "https://localhost",
        "http://localhost:bad",
    ],
)
def test_hostile_frontend_urls_raise(url):
    with pytest.raises(ConfigError):
        load_config({**COMPLETE, "FRONTEND_URL": url, "E2E_TEST_LOGIN": "1"})


@pytest.mark.parametrize("url", ["http://localhost:4173", "http://localhost"])
def test_local_frontend_urls_are_accepted(url):
    config = load_config({**COMPLETE, "FRONTEND_URL": url, "E2E_TEST_LOGIN": "1"})
    assert config.e2e_test_login is True


def test_the_factory_refuses_a_hand_built_non_local_config():
    config = Config(**_required(), e2e_test_login=True)
    with pytest.raises(ConfigError):
        create_e2e_login_router(config)


def test_the_flag_with_a_non_localhost_frontend_raises():
    with pytest.raises(ConfigError):
        load_config({**COMPLETE, "E2E_TEST_LOGIN": "1"})


@pytest.mark.parametrize(
    "value", ["true", "0", "yes", "", " 1x", "TRUE", "on", " 1", "1 ", "1\n"]
)
def test_only_the_exact_string_one_enables(value):
    config = load_config({**COMPLETE, "E2E_TEST_LOGIN": value})
    assert config.e2e_test_login is False
    client = build_app({**LOCAL, "E2E_TEST_LOGIN": value})
    assert client.post("/api/auth/test-login").status_code == 404


def test_unset_is_off_and_the_default_is_off():
    assert load_config(COMPLETE).e2e_test_login is False
    assert Config(**_required()).e2e_test_login is False


def _required():
    return {
        "google_client_id": "a",
        "google_client_secret": "b",
        "session_secret": "c",
        "admin_email": "d@example.com",
        "frontend_url": "https://joey-haas.dev",
        "database_url": "x",
        "database_url_direct": "y",
    }


def test_main_mounts_through_the_guarded_helper_only():
    """A tripwire, not proof of runtime behaviour. main.py builds a real engine
    at import, so it is read, not imported; this only fails if someone edits
    the wiring away from mount_e2e_login."""
    source = (Path(__file__).parent.parent / "main.py").read_text()
    assert "mount_e2e_login(app, config)" in source
    assert "create_e2e_login_router" not in source
