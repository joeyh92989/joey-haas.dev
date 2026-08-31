import pytest

from config import Config, ConfigError, load_config

COMPLETE = {
    "GOOGLE_CLIENT_ID": "client-id",
    "GOOGLE_CLIENT_SECRET": "client-secret",
    "SESSION_SECRET": "session-secret",
    "ADMIN_EMAIL": "josephthaas@gmail.com",
    "FRONTEND_URL": "https://joey-haas.dev",
}


def test_loads_complete_environment():
    config = load_config(COMPLETE)
    assert isinstance(config, Config)
    assert config.admin_email == "josephthaas@gmail.com"
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
