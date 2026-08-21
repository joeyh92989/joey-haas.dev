"""Personal site API.

Serves project data for the portfolio frontend. Individual personal
projects can be mounted here later as routers (one module per project).
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
    return {"status": "ok"}


@app.get("/api/projects")
def list_projects() -> list[dict]:
    """Placeholder project list — replace with real projects (or a database) later."""
    return [
        {
            "name": "This Website",
            "description": "Resume site with a React frontend and FastAPI backend, deployed on Render.",
            "tech": ["React", "FastAPI", "Render"],
            "url": None,
        },
        {
            "name": "Media Collection Tracker",
            "description": "Tool for tracking a video game, movie, and comic collection.",
            "tech": ["Python", "SQL"],
            "url": None,
        },
    ]
