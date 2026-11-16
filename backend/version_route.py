"""GET /api/version: which commit this instance was built from.

Render sets RENDER_GIT_COMMIT on every build. The deploy workflow
(.github/workflows/deploy.yml) polls this route until it matches the commit it
deployed, because /api/health answers the same from the old instance and the
new one, and its body is pinned by scripts/smoke.sh. A commit SHA of a public
repository is not a secret.
"""

import os
from collections.abc import Mapping

from fastapi import APIRouter

from misc_schemas import VersionOut

UNKNOWN = "unknown"


def create_version_router(environ: Mapping[str, str] | None = None) -> APIRouter:
    """The router, reading the commit from `environ` (the process's by default)."""
    env = os.environ if environ is None else environ
    router = APIRouter()

    @router.get("/api/version", response_model=VersionOut)
    def version() -> dict:
        """The commit Render built, or "unknown" off Render."""
        return {"commit": env.get("RENDER_GIT_COMMIT", "").strip() or UNKNOWN}

    return router
