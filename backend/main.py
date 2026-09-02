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
from db import create_engine_and_sessionmaker, engine_lifespan
from items import create_items_router
from schema_check import verify_schema_is_current
from sources.registry import build_registry, configured_sources

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

config = load_config()

# Refuse to serve against a schema this code does not expect. A forgotten
# migration fails here, loudly, rather than surfacing later as a confusing
# query error. This is what makes manual migrations safe.
verify_schema_is_current(config)

# One engine for the process. The pool is what makes Neon's connection limit
# survivable; a per-request engine would exhaust it.
engine, session_factory = create_engine_and_sessionmaker(config.database_url)

# Source credentials are checked lazily, so a missing one cannot stop the
# service booting. This line is what keeps that safe: a mistyped key shows up
# here as an absence at startup rather than only when someone first tries a
# lookup and gets a 503 they have to go digging for.
registry = build_registry(config)
logger.info(
    "metadata sources configured: %s", ", ".join(configured_sources(registry)) or "none"
)

app = FastAPI(title="joey-haas.dev API", lifespan=engine_lifespan(engine))

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
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)

app.include_router(create_auth_router(config))
app.include_router(create_items_router(session_factory, registry))


@app.get("/api/health")
def health() -> dict:
    """Liveness probe. Target of scripts/smoke.sh."""
    return {"status": "ok"}
