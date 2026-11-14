"""The route a deploy polls to learn which commit is live."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from version_route import UNKNOWN, create_version_router


def client(environ):
    app = FastAPI()
    app.include_router(create_version_router(environ))
    return TestClient(app)


def test_reports_the_commit_render_built():
    sha = "0123456789abcdef0123456789abcdef01234567"
    response = client({"RENDER_GIT_COMMIT": sha}).get("/api/version")
    assert response.status_code == 200
    assert response.json() == {"commit": sha}


def test_is_unknown_off_render():
    assert client({}).get("/api/version").json() == {"commit": UNKNOWN}
    assert client({"RENDER_GIT_COMMIT": "  "}).get("/api/version").json() == {
        "commit": UNKNOWN
    }


def test_needs_no_sign_in_and_exposes_only_the_commit():
    body = client({"RENDER_GIT_COMMIT": "abc1234", "SESSION_SECRET": "s"}).get(
        "/api/version"
    )
    assert body.status_code == 200
    assert set(body.json()) == {"commit"}
