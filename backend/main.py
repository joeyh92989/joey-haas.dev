"""Personal site API.

Serves the authenticated and dynamic parts of the site. Public page content is
static and ships in the frontend bundle, so no endpoint here is on the critical
path for a visitor. Individual personal projects can be mounted here later as
routers (one module per project).
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from auth import create_auth_router
from config import allowed_origins, load_config

logging.basicConfig(level=logging.INFO)

config = load_config()

app = FastAPI(title="joey-haas.dev API")

# Signed, HttpOnly, Secure, SameSite=Lax. Thirty days.
#
# joey-haas.dev and api.joey-haas.dev share a registrable domain, so browsers
# treat requests between them as same-site and send this cookie on XHR. That is
# only true because of the custom domain: onrender.com is on the Public Suffix
# List, which made cookie-based sessions impossible there.
app.add_middleware(
    SessionMiddleware,
    secret_key=config.session_secret,
    max_age=2_592_000,
    same_site="lax",
    https_only=True,
)

# An explicit allowlist, not a regex.
#
# The previous rule matched any https://*.onrender.com with credentials
# enabled, which would have let any application hosted on Render make
# credentialed requests to this API once a session cookie existed.
#
# allowed_origins() adds the Vite dev origin only when the frontend is itself
# local, so production carries no standing grant to localhost.
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(config),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(create_auth_router(config))


@app.get("/api/health")
def health() -> dict:
    """Liveness probe. Target of scripts/smoke.sh."""
    return {"status": "ok"}
