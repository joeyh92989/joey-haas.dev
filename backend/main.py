"""Personal site API.

Serves the authenticated and dynamic parts of the site. Public page content is
static and ships in the frontend bundle, so no endpoint here is on the critical
path for a visitor. Individual personal projects can be mounted here later as
routers (one module per project).
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Personal Site API")

# Allow the local dev server and any Render-hosted frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.onrender\.com|http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    """Liveness probe. Target of scripts/smoke.sh."""
    return {"status": "ok"}
