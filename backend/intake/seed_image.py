"""Fetching a seed row's product photo, once, safely (issue #396, D5).

The address comes from a file the owner uploaded, so the server never
trusts it: only https, only a public address (every address the host
resolves to must be global: loopback, private, link-local and metadata
addresses are refused), redirects followed by hand and each hop checked
again, a short timeout, only image content types, and a byte cap enforced
while reading. Requests to one host are spaced (`HostThrottle`).

A residual risk is accepted and noted: the check resolves the host and
the HTTP client resolves it again to connect, so a host that answers
differently the second time (DNS rebinding) could slip past. The caller is
an admin-only route fed by the owner's own file, and the response is only
ever decoded as an image, never returned as it came.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from collections.abc import Awaitable, Callable
from urllib.parse import urljoin, urlsplit

import httpx2

from physical_sources.base import HostThrottle
from physical_sources.limits import USER_AGENT

MAX_BYTES = 6 * 1024 * 1024
MAX_REDIRECTS = 3
# The whole fetch, redirects and body included.
DEADLINE_SECONDS = 20.0
TIMEOUT = httpx2.Timeout(8.0, connect=4.0)
ALLOWED_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})

Resolver = Callable[[str], Awaitable[list[str]]]

# Shared across calls: the spacing is per host, for the process.
_THROTTLE = HostThrottle(per_second=3)


class ImageFetchError(Exception):
    """The photo could not be fetched; the message is the owner's sentence."""


async def resolve(host: str) -> list[str]:
    """Every address `host` resolves to."""
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except OSError:
        raise ImageFetchError("the photo's host does not resolve") from None
    return sorted({info[4][0] for info in infos})


# NAT64 (RFC 6052) embeds an IPv4 address; some resolvers hand it out for
# internal hosts, so it is refused whatever it embeds.
_NAT64 = ipaddress.ip_network("64:ff9b::/96")


def _public(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address.split("%")[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address):
        if ip in _NAT64:
            return False
        if ip.ipv4_mapped is not None:
            return ip.ipv4_mapped.is_global
    return ip.is_global


async def check_url(url: str, resolver: Resolver = resolve) -> str:
    """The URL's host once it is known to be an https address on the public
    internet, else ImageFetchError."""
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        raise ImageFetchError("the photo address is not a valid URL") from None
    if parts.scheme != "https" or not parts.hostname:
        raise ImageFetchError("only https photo addresses are fetched")
    if parts.username or parts.password or port not in (None, 443):
        raise ImageFetchError("the photo address is not a plain https address")
    host = parts.hostname
    try:
        addresses = [str(ipaddress.ip_address(host))]
    except ValueError:
        addresses = await resolver(host)
    if not addresses or not all(_public(address) for address in addresses):
        raise ImageFetchError("the photo address is not on the public internet")
    return host


async def fetch_image(
    url: str,
    *,
    client: httpx2.AsyncClient | None = None,
    resolver: Resolver = resolve,
    throttle: HostThrottle | None = _THROTTLE,
) -> bytes:
    """The photo's bytes, or ImageFetchError. `client` and `resolver` are
    for tests; the default client follows no redirects itself."""
    try:
        async with asyncio.timeout(DEADLINE_SECONDS):
            return await _fetch(url, client, resolver, throttle)
    except TimeoutError:
        raise ImageFetchError("the photo took too long to fetch") from None


async def _fetch(url, client, resolver, throttle) -> bytes:
    own = client is None
    http = client or httpx2.AsyncClient(
        timeout=TIMEOUT,
        follow_redirects=False,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "image/*",
            # The byte cap counts what is read; compression could hide a bomb.
            "Accept-Encoding": "identity",
        },
    )
    try:
        for _ in range(MAX_REDIRECTS + 1):
            host = await check_url(url, resolver)
            if throttle is not None:
                await throttle.wait(host)
            try:
                async with http.stream("GET", url) as response:
                    if response.is_redirect:
                        location = response.headers.get("location")
                        if not location:
                            raise ImageFetchError("the photo address redirects nowhere")
                        url = urljoin(url, location)
                        continue
                    return await _body(response)
            except httpx2.HTTPError as error:
                raise ImageFetchError(
                    f"the photo could not be fetched ({type(error).__name__})"
                ) from None
        raise ImageFetchError("the photo address redirects too often")
    finally:
        if own:
            await http.aclose()


async def _body(response: httpx2.Response) -> bytes:
    if response.status_code != 200:
        raise ImageFetchError(f"the store answered {response.status_code}")
    encoding = response.headers.get("content-encoding", "identity").strip().lower()
    if encoding not in ("", "identity"):
        raise ImageFetchError("the photo came compressed, which is not accepted")
    kind = response.headers.get("content-type", "").split(";")[0].strip().lower()
    if kind not in ALLOWED_TYPES:
        raise ImageFetchError("the address is not a JPEG, PNG or WebP photo")
    declared = response.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_BYTES:
        raise ImageFetchError("the photo is too large")
    data = bytearray()
    async for chunk in response.aiter_bytes():
        data.extend(chunk)
        if len(data) > MAX_BYTES:
            raise ImageFetchError("the photo is too large")
    if not data:
        raise ImageFetchError("the photo is empty")
    return bytes(data)
