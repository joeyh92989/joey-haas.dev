import pytest

from auth import is_allowed
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
