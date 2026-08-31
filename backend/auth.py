"""Google OpenID Connect sign-in for the single admin account."""

from __future__ import annotations

import logging
from collections.abc import Mapping

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, RedirectResponse

from config import Config

logger = logging.getLogger(__name__)

GOOGLE_METADATA_URL = "https://accounts.google.com/.well-known/openid-configuration"


def is_allowed(userinfo: Mapping[str, object], config: Config) -> bool:
    """Whether this Google identity may sign in.

    Three conditions, all required:

    1. Google asserts the address is verified. Without this, an unverified
       account claiming the admin's address would pass. The check is against
       the literal True rather than truthiness, because the string "false" is
       truthy.
    2. The address matches ADMIN_EMAIL, compared case-insensitively after
       stripping whitespace.
    3. If ADMIN_GOOGLE_SUB is configured, the immutable Google subject
       identifier matches too. Google's documentation is explicit that `sub`,
       not `email`, is the stable identifier for an account.
    """
    if userinfo.get("email_verified") is not True:
        return False

    email = str(userinfo.get("email") or "").strip().lower()
    if not email or email != config.admin_email.strip().lower():
        return False

    pinned_sub = (config.admin_google_sub or "").strip()
    if pinned_sub:
        return str(userinfo.get("sub") or "") == pinned_sub

    return True


def create_auth_router(config: Config) -> APIRouter:
    """Builds the auth routes bound to this configuration.

    A factory rather than a module-level router so tests can construct an app
    with a test configuration instead of mutating global state.
    """
    oauth = OAuth()
    oauth.register(
        name="google",
        client_id=config.google_client_id,
        client_secret=config.google_client_secret,
        server_metadata_url=GOOGLE_METADATA_URL,
        client_kwargs={"scope": "openid profile email"},
    )

    router = APIRouter(prefix="/api/auth", tags=["auth"])
    denied = f"{config.frontend_url}/admin?error=access_denied"

    @router.get("/login")
    async def login(request: Request):
        """Redirects to Google. Authlib stores state and nonce in the session."""
        google = oauth.create_client("google")
        redirect_uri = str(request.url_for("callback"))
        return await google.authorize_redirect(request, redirect_uri)

    @router.get("/callback", name="callback")
    async def callback(request: Request):
        """Completes sign-in.

        Authlib verifies the ID token's signature, issuer, audience, expiry,
        and nonce before this code runs. What remains ours is deciding who is
        allowed and what the session records.
        """
        google = oauth.create_client("google")
        try:
            token = await google.authorize_access_token(request)
        except OAuthError:
            logger.warning("OAuth callback failed during token exchange")
            request.session.clear()
            return RedirectResponse(denied, status_code=302)

        userinfo = token.get("userinfo") or {}
        if not is_allowed(userinfo, config):
            logger.warning(
                "Rejected sign-in attempt for %r", userinfo.get("email", "<none>")
            )
            request.session.clear()
            return RedirectResponse(denied, status_code=302)

        # Only these two fields. The cookie is signed, not encrypted, so its
        # contents are readable by whoever holds it.
        request.session["user"] = {
            "sub": str(userinfo["sub"]),
            "email": str(userinfo["email"]),
        }
        # Logged so ADMIN_GOOGLE_SUB can be set for the hardened check.
        logger.info("Admin signed in. sub=%s", userinfo["sub"])
        return RedirectResponse(f"{config.frontend_url}/admin", status_code=302)

    @router.get("/me")
    async def me(request: Request):
        """Reports the signed-in admin, or 401."""
        user = request.session.get("user")
        if not user:
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)
        return {"email": user["email"]}

    @router.post("/logout")
    async def logout(request: Request):
        """Clears the session. POST because it changes state."""
        request.session.clear()
        return JSONResponse(None, status_code=204)

    return router
