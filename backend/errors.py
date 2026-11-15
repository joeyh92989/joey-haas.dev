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
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


def add_json_errors(app: FastAPI) -> None:
    """Registers the catch-all and the shared 4xx body shape. Call it before
    adding CORSMiddleware, so CORS is added later and wraps it (the last
    middleware added is outermost).

    Every error body is `{"detail": ...}`, the one key the frontend's
    `errorMessage` reads: a string, or for a 422 a list of
    `{type, loc, msg}` (never the caller's `input`). Status codes and
    headers are untouched."""

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException):
        # The router's own 404 says "Not Found"; ours say "Not found".
        detail = (
            "Not found"
            if exc.status_code == 404 and exc.detail == "Not Found"
            else exc.detail
        )
        return JSONResponse(
            {"detail": detail}, status_code=exc.status_code, headers=exc.headers
        )

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, exc: RequestValidationError):
        detail = [
            {"type": e["type"], "loc": list(e["loc"]), "msg": e["msg"]}
            for e in exc.errors()
        ]
        return JSONResponse({"detail": detail}, status_code=422)

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
