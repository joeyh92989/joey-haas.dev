"""Fetching a seed row's photo (intake/seed_image.py, #396): the SSRF rules."""

from __future__ import annotations

import httpx2
import pytest

from intake.seed_image import (
    MAX_BYTES,
    ImageFetchError,
    check_url,
    fetch_image,
)


async def public(host):
    return ["93.184.216.34"]


def client(handler) -> httpx2.AsyncClient:
    return httpx2.AsyncClient(
        transport=httpx2.MockTransport(handler), follow_redirects=False
    )


def ok(body=b"imagebytes", kind="image/jpeg"):
    return lambda request: httpx2.Response(
        200, content=body, headers={"content-type": kind}
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "url",
    [
        "http://img.example.test/a.jpg",
        "ftp://img.example.test/a.jpg",
        "https://user:pw@img.example.test/a.jpg",
        "https://img.example.test:8443/a.jpg",
        "https:///a.jpg",
        "not a url",
        "https://127.0.0.1/a.jpg",
        "https://[::1]/a.jpg",
        "https://169.254.169.254/latest/meta-data",
        "https://10.0.0.5/a.jpg",
        "https://192.168.1.1/a.jpg",
    ],
)
async def test_unsafe_addresses_are_refused_before_any_request(url):
    with pytest.raises(ImageFetchError):
        await check_url(url, public)


@pytest.mark.asyncio
@pytest.mark.parametrize("address", ["127.0.0.1", "10.1.2.3", "169.254.169.254", "::1"])
async def test_a_host_that_resolves_to_a_private_address_is_refused(address):
    async def resolver(host):
        return ["93.184.216.34", address]  # one bad address is enough

    with pytest.raises(ImageFetchError, match="public"):
        await check_url("https://img.example.test/a.jpg", resolver)


@pytest.mark.asyncio
async def test_a_public_https_photo_is_fetched():
    async with client(ok(b"abc")) as http:
        data = await fetch_image(
            "https://img.example.test/a.jpg",
            client=http,
            resolver=public,
            throttle=None,
        )
    assert data == b"abc"


@pytest.mark.asyncio
async def test_only_image_types_are_taken():
    async with client(ok(b"<html>", "text/html")) as http:
        with pytest.raises(ImageFetchError, match="JPEG"):
            await fetch_image(
                "https://img.example.test/a",
                client=http,
                resolver=public,
                throttle=None,
            )


@pytest.mark.asyncio
async def test_a_failing_status_is_worded():
    async with client(lambda r: httpx2.Response(404)) as http:
        with pytest.raises(ImageFetchError, match="404"):
            await fetch_image(
                "https://img.example.test/a",
                client=http,
                resolver=public,
                throttle=None,
            )


@pytest.mark.asyncio
async def test_a_photo_over_the_cap_is_refused_while_reading():
    big = b"x" * (MAX_BYTES + 1)
    async with client(ok(big)) as http:
        with pytest.raises(ImageFetchError, match="too large"):
            await fetch_image(
                "https://img.example.test/a",
                client=http,
                resolver=public,
                throttle=None,
            )


@pytest.mark.asyncio
async def test_an_https_redirect_is_followed_and_checked_again():
    def handler(request):
        if request.url.path == "/a":
            return httpx2.Response(302, headers={"location": "/b.jpg"})
        return ok(b"final")(request)

    async with client(handler) as http:
        data = await fetch_image(
            "https://img.example.test/a", client=http, resolver=public, throttle=None
        )
    assert data == b"final"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "target",
    [
        "http://img.example.test/b.jpg",
        "https://169.254.169.254/x",
        "https://localhost2/x",
    ],
)
async def test_a_redirect_off_https_or_to_a_private_host_is_refused(target):
    calls = []

    def handler(request):
        calls.append(str(request.url))
        return httpx2.Response(302, headers={"location": target})

    async def resolver(host):
        return ["127.0.0.1"] if host == "localhost2" else ["93.184.216.34"]

    async with client(handler) as http:
        with pytest.raises(ImageFetchError):
            await fetch_image(
                "https://img.example.test/a",
                client=http,
                resolver=resolver,
                throttle=None,
            )
    assert calls == ["https://img.example.test/a"]  # the second hop never left


@pytest.mark.asyncio
async def test_redirect_loops_stop():
    async with client(
        lambda r: httpx2.Response(
            302, headers={"location": "https://img.example.test/a"}
        )
    ) as http:
        with pytest.raises(ImageFetchError, match="redirects too often"):
            await fetch_image(
                "https://img.example.test/a",
                client=http,
                resolver=public,
                throttle=None,
            )


@pytest.mark.asyncio
async def test_a_transport_failure_is_worded_without_the_url():
    def handler(request):
        raise httpx2.ConnectTimeout("slow", request=request)

    async with client(handler) as http:
        with pytest.raises(ImageFetchError) as caught:
            await fetch_image(
                "https://img.example.test/a?key=SECRET",
                client=http,
                resolver=public,
                throttle=None,
            )
    assert "SECRET" not in str(caught.value)
