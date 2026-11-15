"""Cache-Control and a weak ETag on the unauthenticated public reads (#265).

`/shelf/games` refetches `/api/public/items` on every visit after painting
the snapshot, which wakes the free-tier API and sends the whole body each
time. A 60 second max-age spares repeat visits, and an ETag lets a
revalidation cost a 304 instead of 100 KB.

The ETag is a hash of the body actually served, not the `/next` fingerprint
(public_next_cache.py): the fingerprint remains the server-side cache key for
that one body, and nothing new a body reads has to join anything here, since
a changed body changes its hash. The body is still built per request; only
the transfer is saved.

Only a 200 GET under /api/public/ is touched, so no error or write gets a
cache header. A route that sets its own Cache-Control (/status) keeps it.
"""

from __future__ import annotations

import hashlib

from fastapi import FastAPI, Request, Response

PREFIX = "/api/public/"
CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300"


def _matches(header: str, etag: str) -> bool:
    """Whether an If-None-Match value names `etag` (weak comparison)."""
    wanted = etag.removeprefix("W/")
    for part in header.split(","):
        part = part.strip()
        if part == "*" or part.removeprefix("W/") == wanted:
            return True
    return False


def add_public_cache(app: FastAPI) -> None:
    """Register before CORSMiddleware, so CORS stays outermost and its
    headers land on the 304 too."""

    @app.middleware("http")
    async def public_cache(request: Request, call_next):
        response = await call_next(request)
        if (
            request.method != "GET"
            or not request.url.path.startswith(PREFIX)
            or response.status_code != 200
        ):
            return response
        body = b"".join([chunk async for chunk in response.body_iterator])
        etag = f'W/"{hashlib.sha256(body).hexdigest()[:32]}"'
        headers = {
            k: v
            for k, v in response.headers.items()
            if k.lower() not in ("content-length", "content-encoding")
        }
        headers["etag"] = etag
        headers.setdefault("cache-control", CACHE_CONTROL)
        if _matches(request.headers.get("if-none-match", ""), etag):
            for k in ("content-type",):
                headers.pop(k, None)
            return Response(status_code=304, headers=headers)
        return Response(
            content=body,
            status_code=200,
            headers=headers,
            media_type=response.media_type,
        )
