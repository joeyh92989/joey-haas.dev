"""Refuses state-changing requests a browser sent from a foreign origin.

The session cookie is SameSite=Lax, which withholds it on cross-site POSTs.
But "site" is the registrable domain: any *.joey-haas.dev host counts as
same-site, so a dangling or taken-over subdomain could submit a plain form
to an admin route that takes no body and the cookie would ride along. JSON
routes are already safe (a form cannot send application/json without a
preflight CORS refuses); bodiless POSTs such as pin, own and the catalogue
refreshes are not.

Browsers send Origin on every cross-origin request and on every POST, so a
state-changing request whose Origin is present and not one of ours is
refused. A request with no Origin is not from a browser page (curl, the
nightly job's bearer token), cannot carry a victim's cookie by accident, and
passes; require_admin still decides whether it may do anything.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def origin_allowed(method: str, origin: str | None, allowed: frozenset[str]) -> bool:
    """Whether a request may proceed. Pure, for the tests."""
    if method.upper() not in UNSAFE_METHODS or origin is None:
        return True
    return origin in allowed


def add_origin_check(app: FastAPI, origins: list[str]) -> None:
    """Registers the check. Call it before adding CORSMiddleware, so the
    refusal still carries CORS headers and reads as a 403, not a network
    error, to a page on an allowed origin that was misconfigured."""
    allowed = frozenset(origins)

    @app.middleware("http")
    async def origin_check(request: Request, call_next):
        origin = request.headers.get("origin")
        if origin_allowed(request.method, origin, allowed):
            return await call_next(request)
        logger.warning(
            "refused %s %s from origin %r", request.method, request.url.path, origin
        )
        return JSONResponse(status_code=403, content={"detail": "Origin not allowed"})
