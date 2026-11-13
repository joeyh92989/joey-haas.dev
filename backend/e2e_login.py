"""Local-only test sign-in, so browser tests can reach /admin (#205).

This is an authentication bypass by design. It exists only so Playwright can
sign in without Google, and three independent guards keep it out of production:

1. config.load_config turns it on only for E2E_TEST_LOGIN == "1" exactly, and
   refuses to load at all when that is set with a FRONTEND_URL that is not
   http://localhost...
2. main.py reaches the router only through mount_e2e_login, which mounts
   nothing unless config.e2e_test_login is true.
3. The router factory re-checks the localhost rule, so a Config built by hand
   cannot slip past guard 1.

The route takes no input and signs in exactly the configured admin. It goes
through origin_check like any other POST. scripts/smoke.sh asserts it answers
404 on the deployed API.
"""

from __future__ import annotations

from fastapi import APIRouter, FastAPI, Request, Response

from config import Config, ConfigError

LOCALHOST_PREFIX = "http://localhost"


def create_e2e_login_router(config: Config) -> APIRouter:
    """The test sign-in route bound to this configuration."""
    if not config.frontend_url.startswith(LOCALHOST_PREFIX):
        raise ConfigError("The test sign-in route is local only.")

    router = APIRouter(prefix="/api/auth", tags=["auth"])
    # The sub the real flow would record: the pinned one when set, so the
    # session still matches auth.session_admin's allowlist.
    sub = config.admin_google_sub or "e2e"

    @router.post("/test-login", status_code=204)
    async def test_login(request: Request) -> Response:
        """Signs in as the configured admin. No body, no parameters."""
        request.session["user"] = {"sub": sub, "email": config.admin_email}
        return Response(status_code=204)

    return router


def mount_e2e_login(app: FastAPI, config: Config) -> None:
    """Mounts the route only when E2E_TEST_LOGIN is on. main.py's only entry."""
    if config.e2e_test_login:
        app.include_router(create_e2e_login_router(config))
