"""#377: the last twelve routes declare a response model, or an explained
`response_model=None`, and the models carry the keys today's bodies do."""

from __future__ import annotations

from fastapi import FastAPI

from analytics_routes import create_analytics_router, create_track_router
from auth import create_auth_router
from config import Config
from e2e_login import create_e2e_login_router
from importer import create_import_router
from items import create_items_router
from journal_routes import create_journal_router
from tests.test_auth import BASE
from version_route import create_version_router

LOCAL = Config(**{**BASE.__dict__, "frontend_url": "http://localhost:5173"})

# (method, path) -> the 2xx answer carries a JSON schema.
MODELLED = {
    ("get", "/api/version"),
    ("get", "/api/auth/me"),
    ("get", "/api/analytics"),
    ("post", "/api/analytics/rollup"),
    ("post", "/api/import/photos"),
}
# Allowed response_model=None: no JSON body to pin.
NO_BODY = {
    ("get", "/api/auth/login"),  # redirect to Google
    ("get", "/api/auth/callback"),  # 302 redirects only
    ("post", "/api/auth/logout"),  # 204
    ("post", "/api/auth/test-login"),  # 204
    ("post", "/api/track"),  # 204
    ("delete", "/api/items/{item_id}"),  # 204
    ("delete", "/api/items/{item_id}/sessions/{session_id}"),  # 204
}


def _spec() -> dict:
    app = FastAPI()
    app.include_router(create_version_router({}))
    app.include_router(create_auth_router(LOCAL))
    app.include_router(create_e2e_login_router(LOCAL))
    app.include_router(create_track_router(None, "s"))
    app.include_router(create_analytics_router(None))
    app.include_router(create_journal_router(None))
    app.include_router(create_import_router({}, lambda: None))
    app.include_router(create_items_router(None))
    return app.openapi()


def _ok(op: dict) -> dict:
    return next(r for code, r in op["responses"].items() if code.startswith("2"))


def test_every_route_is_modelled_or_has_no_body():
    paths = _spec()["paths"]
    for method, path in MODELLED:
        schema = _ok(paths[path][method]).get("content", {})["application/json"][
            "schema"
        ]
        assert schema not in ({}, {"type": "object"}), (method, path)
    for method, path in NO_BODY:
        assert "content" not in _ok(paths[path][method]) or (
            # redirects document no JSON schema of ours
            _ok(paths[path][method])["content"]["application/json"]["schema"] == {}
        ), (method, path)


def test_the_models_name_todays_keys():
    schemas = _spec()["components"]["schemas"]
    assert set(schemas["VersionOut"]["properties"]) == {"commit"}
    assert set(schemas["RollupOut"]["properties"]) == {"days", "deleted"}
    assert set(schemas["AdminSummaryOut"]["properties"]) == {
        "range", "start", "end", "views", "visitors", "views_per_visitor",
        "best_day", "series", "pages", "referrers", "referrers_other",
        "devices", "live_since",
    }  # fmt: skip
    assert set(schemas["AdminBestDayOut"]["properties"]) == {
        "day", "views", "referrer",
    }  # fmt: skip
    assert set(schemas["ImportRowOut"]["properties"]) == {
        "index", "detected_title", "media_type", "detected_year",
        "detected_platform", "platform_id", "status", "confidence", "reason",
        "match", "candidates",
    }  # fmt: skip
    assert set(schemas["ImportPhotosOut"]["properties"]) == {"detections"}
