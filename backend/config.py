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
    "DATABASE_URL",
    "DATABASE_URL_DIRECT",
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
    database_url: str
    database_url_direct: str
    admin_google_sub: str | None = None

    # Deliberately absent from _REQUIRED. The required set exists because
    # running without those values is unsafe -- a forgeable session is worse
    # than no service. These are a different kind of thing: without a
    # ComicVine key, comic lookups are unavailable and everything else works.
    # Requiring them would mean a deploy of the film feature could not boot
    # without a board-game registration.
    tmdb_api_token: str | None = None
    igdb_client_id: str | None = None
    igdb_client_secret: str | None = None
    comicvine_api_key: str | None = None
    # BGG stopped serving the XML API anonymously in late 2025; it now needs a
    # registered application and a token. See sources/bgg.py.
    bgg_token: str | None = None
    llm_provider: str = "gemini"
    gemini_api_key: str | None = None
    anthropic_api_key: str | None = None


LOCAL_DEV_ORIGIN = "http://localhost:5173"


def allowed_origins(config: Config) -> list[str]:
    """The exact origins permitted to make credentialed requests.

    The Vite dev server's origin is included only when the frontend is itself
    running locally. Granting it in production would leave a standing
    credentialed CORS grant to whatever happens to be listening on port 5173 on
    the user's machine — harmless while the session cookie is SameSite=Lax,
    which withholds it cross-site, but live the moment that changes.
    """
    origins = [config.frontend_url]
    if config.frontend_url.startswith("http://localhost"):
        origins.append(LOCAL_DEV_ORIGIN)
    return list(dict.fromkeys(origins))


def _optional(source: Mapping[str, str], name: str) -> str | None:
    """A configuration value that may legitimately be absent.

    Blank and unset collapse to None for the same reason load_config treats a
    blank required value as missing: an empty box is a mistake, not a choice.
    """
    return str(source.get(name, "")).strip() or None


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
        database_url=str(source["DATABASE_URL"]).strip(),
        database_url_direct=str(source["DATABASE_URL_DIRECT"]).strip(),
        admin_google_sub=optional_sub or None,
        tmdb_api_token=_optional(source, "TMDB_API_TOKEN"),
        igdb_client_id=_optional(source, "IGDB_CLIENT_ID"),
        igdb_client_secret=_optional(source, "IGDB_CLIENT_SECRET"),
        comicvine_api_key=_optional(source, "COMICVINE_API_KEY"),
        bgg_token=_optional(source, "BGG_TOKEN"),
        llm_provider=_optional(source, "LLM_PROVIDER") or "gemini",
        gemini_api_key=_optional(source, "GEMINI_API_KEY"),
        anthropic_api_key=_optional(source, "ANTHROPIC_API_KEY"),
    )
