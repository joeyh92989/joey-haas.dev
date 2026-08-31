from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.sessions import SessionMiddleware

from auth import create_auth_router, is_allowed
from config import Config

BASE = Config(
    google_client_id="client-id",
    google_client_secret="client-secret",
    session_secret="session-secret",
    admin_email="josephthaas@gmail.com",
    frontend_url="https://joey-haas.dev",
)

VALID = {"email": "josephthaas@gmail.com", "email_verified": True, "sub": "123"}


def test_verified_matching_email_is_allowed():
    assert is_allowed(VALID, BASE) is True


def test_email_comparison_ignores_case_and_whitespace():
    assert is_allowed({**VALID, "email": "  JosephTHaas@GMAIL.com "}, BASE) is True


def test_unverified_email_is_denied():
    # The single most important case here: without this check, an unverified
    # Google account asserting the admin's address would sign in successfully.
    assert is_allowed({**VALID, "email_verified": False}, BASE) is False


def test_missing_email_verified_is_denied():
    userinfo = {"email": "josephthaas@gmail.com", "sub": "123"}
    assert is_allowed(userinfo, BASE) is False


def test_truthy_but_non_true_email_verified_is_denied():
    # Guards against a loose truthiness check: the string "false" is truthy.
    assert is_allowed({**VALID, "email_verified": "false"}, BASE) is False


def test_different_email_is_denied():
    assert is_allowed({**VALID, "email": "someone@else.com"}, BASE) is False


def test_empty_userinfo_is_denied():
    assert is_allowed({}, BASE) is False


def test_sub_pinning_allows_matching_sub():
    config = Config(**{**BASE.__dict__, "admin_google_sub": "123"})
    assert is_allowed(VALID, config) is True


def test_sub_pinning_denies_wrong_sub_even_with_matching_email():
    config = Config(**{**BASE.__dict__, "admin_google_sub": "999"})
    assert is_allowed(VALID, config) is False


@pytest.mark.parametrize("sub", [None, "", "  "])
def test_blank_sub_pin_falls_back_to_email_only(sub):
    config = Config(**{**BASE.__dict__, "admin_google_sub": sub})
    assert is_allowed(VALID, config) is True


def build_client(config=BASE):
    app = FastAPI()
    app.add_middleware(
        SessionMiddleware,
        secret_key=config.session_secret,
        max_age=2_592_000,
        same_site="lax",
        https_only=True,
    )
    app.include_router(create_auth_router(config))
    return TestClient(app, base_url="https://testserver")


def sign_in(client, userinfo=None, extra_token_fields=None):
    """Drives the callback with Google's token exchange mocked."""
    token = {"userinfo": userinfo if userinfo is not None else VALID}
    if extra_token_fields:
        token.update(extra_token_fields)
    with patch("auth.OAuth.create_client") as create_client:
        create_client.return_value.authorize_access_token = AsyncMock(
            return_value=token
        )
        return client.get("/api/auth/callback", follow_redirects=False)


def test_me_without_session_is_401():
    client = build_client()
    assert client.get("/api/auth/me").status_code == 401


def test_callback_rejects_disallowed_account_without_creating_session():
    client = build_client()
    response = sign_in(
        client, {"email": "someone@else.com", "email_verified": True, "sub": "9"}
    )

    assert response.status_code == 302
    assert "error=access_denied" in response.headers["location"]
    assert client.get("/api/auth/me").status_code == 401


def test_callback_accepts_allowed_account_and_creates_session():
    client = build_client()
    response = sign_in(client)

    assert response.status_code == 302
    assert response.headers["location"] == "https://joey-haas.dev/admin"

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json() == {"email": "josephthaas@gmail.com"}


def test_session_cookie_carries_security_flags():
    client = build_client()
    raw = sign_in(client).headers.get("set-cookie", "").lower()
    assert "httponly" in raw
    assert "samesite=lax" in raw
    assert "secure" in raw


def test_logout_clears_the_session():
    client = build_client()
    sign_in(client)

    assert client.get("/api/auth/me").status_code == 200
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_session_never_contains_a_token():
    # The session cookie is signed, not encrypted: anything placed in it is
    # readable by whoever holds the cookie. This asserts we put nothing
    # sensitive there even when Google hands us tokens.
    client = build_client()
    response = sign_in(
        client,
        extra_token_fields={
            "access_token": "SECRETACCESSTOKEN",
            "id_token": "SECRETIDTOKEN",
        },
    )

    raw = response.headers.get("set-cookie", "")
    assert "SECRETACCESSTOKEN" not in raw
    assert "SECRETIDTOKEN" not in raw
