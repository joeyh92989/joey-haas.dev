"""Unhandled errors as JSON 500s that keep their CORS headers.

Starlette answers an unhandled exception from ServerErrorMiddleware, the
outermost layer, which sits outside CORSMiddleware: the 500 reaches the
browser without Access-Control-Allow-Origin, and the SPA sees an opaque
network error instead of a status it can report. An exception handler for
Exception or 500 does not help, because Starlette installs those on the same
outer middleware. Catching the error in a middleware *inside* CORS does.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


def add_json_errors(app: FastAPI) -> None:
    """Registers the catch-all. Call it before adding CORSMiddleware, so CORS
    is added later and wraps it (the last middleware added is outermost)."""

    @app.middleware("http")
    async def json_errors(request: Request, call_next):
        try:
            return await call_next(request)
        except Exception:
            # The path only: a query string is not logged anywhere here.
            logger.exception(
                "unhandled error on %s %s", request.method, request.url.path
            )
            return JSONResponse(
                status_code=500, content={"detail": "Internal Server Error"}
            )
