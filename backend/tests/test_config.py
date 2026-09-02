import pytest

from config import Config, ConfigError, allowed_origins, load_config

COMPLETE = {
    "GOOGLE_CLIENT_ID": "client-id",
    "GOOGLE_CLIENT_SECRET": "client-secret",
    "SESSION_SECRET": "session-secret",
    "ADMIN_EMAIL": "admin@example.com",
    "FRONTEND_URL": "https://joey-haas.dev",
    "DATABASE_URL": "postgresql://u:p@host-pooler.neon.tech/neondb",
    "DATABASE_URL_DIRECT": "postgresql://u:p@host.neon.tech/neondb",
}


def test_loads_complete_environment():
    config = load_config(COMPLETE)
    assert isinstance(config, Config)
    assert config.admin_email == "admin@example.com"
    assert config.admin_google_sub is None


def test_admin_google_sub_is_optional_but_read_when_present():
    config = load_config({**COMPLETE, "ADMIN_GOOGLE_SUB": "1234567890"})
    assert config.admin_google_sub == "1234567890"


@pytest.mark.parametrize("missing", sorted(COMPLETE))
def test_missing_required_variable_raises(missing):
    env = {key: value for key, value in COMPLETE.items() if key != missing}
    with pytest.raises(ConfigError) as excinfo:
        load_config(env)
    assert missing in str(excinfo.value)


def test_blank_value_counts_as_missing():
    # A variable set to an empty string in a dashboard is a common mistake and
    # must fail as loudly as one that is absent entirely.
    with pytest.raises(ConfigError):
        load_config({**COMPLETE, "SESSION_SECRET": "   "})


def test_trailing_slash_is_stripped_from_frontend_url():
    # Redirects concatenate this with "/admin"; a trailing slash would produce
    # a double slash in the Location header.
    config = load_config({**COMPLETE, "FRONTEND_URL": "https://joey-haas.dev/"})
    assert config.frontend_url == "https://joey-haas.dev"


def test_config_is_frozen():
    config = load_config(COMPLETE)
    with pytest.raises(Exception):
        config.admin_email = "someone@else.com"


def test_production_origins_exclude_localhost():
    # A standing credentialed CORS grant to the Vite dev port in production
    # would be live the moment the session cookie stopped being SameSite=Lax.
    config = load_config(COMPLETE)
    assert allowed_origins(config) == ["https://joey-haas.dev"]


def test_local_frontend_also_allows_the_vite_dev_origin():
    config = load_config({**COMPLETE, "FRONTEND_URL": "http://localhost:5173"})
    assert allowed_origins(config) == ["http://localhost:5173"]


def test_local_frontend_on_another_port_allows_both():
    config = load_config({**COMPLETE, "FRONTEND_URL": "http://localhost:4173"})
    assert allowed_origins(config) == ["http://localhost:4173", "http://localhost:5173"]


def test_database_urls_are_read():
    config = load_config(COMPLETE)
    assert config.database_url == "postgresql://u:p@host-pooler.neon.tech/neondb"
    assert config.database_url_direct == "postgresql://u:p@host.neon.tech/neondb"


def test_source_and_llm_keys_are_optional():
    # A deploy of the film feature must not be blocked by a board-game
    # registration. Absent source keys mean a smaller feature set, not a
    # refusal to boot -- which is why none of them are in _REQUIRED.
    config = load_config(COMPLETE)
    assert config.tmdb_api_token is None
    assert config.igdb_client_id is None
    assert config.comicvine_api_key is None
    assert config.gemini_api_key is None
    assert config.anthropic_api_key is None


def test_llm_provider_defaults_to_gemini_when_unset_or_blank():
    assert load_config(COMPLETE).llm_provider == "gemini"
    assert load_config({**COMPLETE, "LLM_PROVIDER": "   "}).llm_provider == "gemini"


def test_source_keys_are_read_and_stripped_when_present():
    config = load_config({**COMPLETE, "TMDB_API_TOKEN": "  token  "})
    assert config.tmdb_api_token == "token"
