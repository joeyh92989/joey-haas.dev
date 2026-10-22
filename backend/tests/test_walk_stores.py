"""The runner-side Shopify walk, against the recorded stores and the real
ingest route (or a fake API where the API's answer is the point)."""

import importlib.util
import os
import subprocess
import sys
from pathlib import Path

import httpx2
import pytest
from physical_support import client_for, serve_fixtures
from sqlalchemy import func, select

from models import CatalogueRun, StoreListing

SCRIPT = Path(__file__).parents[1] / "scripts" / "walk_stores.py"
spec = importlib.util.spec_from_file_location("walk_stores", SCRIPT)
walk_stores = importlib.util.module_from_spec(spec)
spec.loader.exec_module(walk_stores)

pytestmark = pytest.mark.asyncio


def stores(handler=None):
    return httpx2.AsyncClient(
        transport=httpx2.MockTransport(handler or serve_fixtures())
    )


def fake_api(answer):
    """An API answering every request with `answer(request)`; it records them."""
    seen = []

    def handler(request):
        seen.append((request.method, request.url.path))
        return answer(request)

    client = httpx2.AsyncClient(
        transport=httpx2.MockTransport(handler), base_url="http://api.test"
    )
    return client, seen


@pytest.fixture(autouse=True)
def fast_throttle(monkeypatch):
    real = walk_stores.HostThrottle
    monkeypatch.setattr(walk_stores, "HostThrottle", lambda: real(per_second=1000))


async def test_each_store_is_walked_and_recorded(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as api, stores() as client:
        status = await walk_stores.run(["super_rare", "nicalis"], client, api)
    assert status == 0
    async with sessionmaker_for_test() as session:
        runs = (
            await session.execute(select(CatalogueRun.source, CatalogueRun.ok))
        ).all()
        listed = await session.scalar(select(func.count()).select_from(StoreListing))
    assert sorted(runs) == [("nicalis", True), ("super_rare", True)]
    assert listed > 0


async def test_a_walk_that_raises_is_recorded_as_a_failed_run(
    sessionmaker_for_test, monkeypatch
):
    async def boom(*args, **kwargs):
        raise RuntimeError("parser broke")

    monkeypatch.setattr(walk_stores.shopify, "list_products", boom)
    async with client_for(sessionmaker_for_test) as api, stores() as client:
        status = await walk_stores.run(["nicalis"], client, api)
    assert status == 1
    async with sessionmaker_for_test() as session:
        run = await session.scalar(select(CatalogueRun))
    assert run.ok is False
    assert run.errors == [{"code": "internal", "detail": "RuntimeError"}]


async def test_a_401_stops_the_walk_with_its_own_status():
    api, seen = fake_api(lambda request: httpx2.Response(401))
    async with api, stores() as client:
        status = await walk_stores.run(["super_rare", "nicalis"], client, api)
    assert status == walk_stores.UNAUTHORIZED == 3
    assert seen == [("GET", "/api/physical/stores/super_rare/html-skip")]


async def test_a_refused_ingest_fails_that_store_and_the_rest_go_on():
    def answer(request):
        if request.method == "GET":
            return httpx2.Response(503)
        if "super_rare" in request.url.path:
            return httpx2.Response(422, json={"detail": "products[0]: nope"})
        return httpx2.Response(
            200,
            json={
                "ok": True,
                "rows_seen": 1,
                "rows_changed": 1,
                "rows_retired": 0,
                "short_run": False,
                "errors": [],
            },
        )

    api, seen = fake_api(answer)
    async with api, stores() as client:
        status = await walk_stores.run(["super_rare", "nicalis"], client, api)
    assert status == 1
    # html-skip failing costs nothing but page reads: both stores were posted.
    assert [path for method, path in seen if method == "POST"] == [
        "/api/physical/stores/super_rare/ingest",
        "/api/physical/stores/nicalis/ingest",
    ]


RUN = {
    "ok": True,
    "rows_seen": 1,
    "rows_changed": 1,
    "rows_retired": 0,
    "short_run": False,
    "errors": [],
}


async def test_a_busy_catalogue_is_waited_out(monkeypatch):
    monkeypatch.setattr(walk_stores, "BUSY_WAIT_SECONDS", 0)
    posts = []

    def answer(request):
        if request.method == "GET":
            return httpx2.Response(200, json={"handles": []})
        posts.append(request.url.path)
        return httpx2.Response(409 if len(posts) < 3 else 200, json=RUN)

    api, _ = fake_api(answer)
    async with api, stores() as client:
        assert await walk_stores.run(["nicalis"], client, api) == 0
    assert len(posts) == 3


async def test_a_catalogue_busy_past_every_retry_fails_the_store(monkeypatch):
    monkeypatch.setattr(walk_stores, "BUSY_WAIT_SECONDS", 0)
    api, seen = fake_api(lambda request: httpx2.Response(409))
    async with api, stores() as client:
        assert await walk_stores.run(["nicalis"], client, api) == 1
    posts = [path for method, path in seen if method == "POST"]
    assert len(posts) == walk_stores.BUSY_RETRIES + 1


async def test_a_200_that_is_not_the_api_fails_that_store_only():
    def answer(request):
        if "super_rare" in request.url.path:
            return httpx2.Response(200, text="<html>waking</html>")
        if request.method == "GET":
            return httpx2.Response(200, json={"handles": []})
        return httpx2.Response(200, json=RUN)

    api, seen = fake_api(answer)
    async with api, stores() as client:
        status = await walk_stores.run(["super_rare", "nicalis"], client, api)
    assert status == 1
    assert ("POST", "/api/physical/stores/nicalis/ingest") in seen


async def test_an_unreachable_api_fails_every_store():
    def answer(request):
        raise httpx2.ConnectError("down", request=request)

    api, _ = fake_api(answer)
    async with api, stores() as client:
        assert await walk_stores.run(["nicalis"], client, api) == 1


@pytest.mark.parametrize(
    ("args", "env"),
    [
        (["nicalis"], {}),
        (["pixelheart"], {"API_URL": "http://x", "JOB_TOKEN": "t"}),
    ],
)
async def test_usage_errors_exit_2_before_any_request(args, env):
    clean = {k: v for k, v in os.environ.items() if k not in ("API_URL", "JOB_TOKEN")}
    result = subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        env={**clean, **env},
        capture_output=True,
        text=True,
    )
    assert result.returncode == 2


async def test_the_script_needs_nothing_but_httpx2():
    check = (
        f"import runpy, sys; runpy.run_path({str(SCRIPT)!r}, run_name='walk'); "
        "loaded = [m for m in ('fastapi', 'sqlalchemy', 'config', 'models', 'db') "
        "if m in sys.modules]; print(','.join(loaded))"
    )
    result = subprocess.run(
        [sys.executable, "-c", check], capture_output=True, text=True
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == ""
