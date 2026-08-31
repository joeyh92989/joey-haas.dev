"""Environment configuration, validated at startup.

Every required value is checked when the app boots rather than when it is first
used. A service that starts with a missing SESSION_SECRET would look healthy
while every session it issues is forgeable; crashing immediately is correct.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()

_REQUIRED = (
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "SESSION_SECRET",
    "ADMIN_EMAIL",
    "FRONTEND_URL",
)


class ConfigError(RuntimeError):
    """Raised when required configuration is absent or blank."""


@dataclass(frozen=True)
class Config:
    """Validated application configuration."""

    google_client_id: str
    google_client_secret: str
    session_secret: str
    admin_email: str
    frontend_url: str
    admin_google_sub: str | None = None


def load_config(env: Mapping[str, str] | None = None) -> Config:
    """Reads configuration from `env`, defaulting to the process environment.

    Raises ConfigError naming every missing variable. A value that is present
    but blank counts as missing: an empty box in a dashboard is a mistake, not
    a deliberate choice.
    """
    source = os.environ if env is None else env

    missing = [name for name in _REQUIRED if not str(source.get(name, "")).strip()]
    if missing:
        raise ConfigError(
            "Missing required environment variable(s): " + ", ".join(missing)
        )

    optional_sub = str(source.get("ADMIN_GOOGLE_SUB", "")).strip()

    return Config(
        google_client_id=str(source["GOOGLE_CLIENT_ID"]).strip(),
        google_client_secret=str(source["GOOGLE_CLIENT_SECRET"]).strip(),
        session_secret=str(source["SESSION_SECRET"]).strip(),
        admin_email=str(source["ADMIN_EMAIL"]).strip(),
        frontend_url=str(source["FRONTEND_URL"]).strip().rstrip("/"),
        admin_google_sub=optional_sub or None,
    )
