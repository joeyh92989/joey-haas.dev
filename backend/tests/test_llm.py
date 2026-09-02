"""The provider seam: request shape, response parsing, retries, size guard.

Request building and response parsing are tested directly against the pure
methods. What matters is that the body carries the schema and the image bytes
in the shape each provider documents, and a mocked client would only confirm
that the mock was configured the way the test configured it.

The retry tests are the exception and do stand in for the HTTP client, because
retrying is behaviour of the request loop rather than of a pure function --
there is nothing else to observe it through.
"""

import base64
import json

import pytest

from config import Config
from llm import (
    MAX_REQUEST_BYTES,
    AnthropicProvider,
    GeminiProvider,
    Image,
    LLMError,
    build_provider,
    guard_payload_size,
)

SCHEMA = {
    "type": "object",
    "properties": {"titles": {"type": "array", "items": {"type": "string"}}},
    "required": ["titles"],
    "additionalProperties": False,
}

JPEG = Image("image/jpeg", b"\xff\xd8bytes")


def _config(**overrides) -> Config:
    base = dict(
        google_client_id="x",
        google_client_secret="x",
        session_secret="x",
        admin_email="x@example.com",
        frontend_url="http://localhost:5173",
        database_url="postgresql://x",
        database_url_direct="postgresql://x",
    )
    return Config(**{**base, **overrides})


def test_gemini_body_carries_the_schema_and_the_image():
    body = GeminiProvider(api_key="k")._build_body("read the spines", SCHEMA, [JPEG])

    parts = body["contents"][0]["parts"]
    inline = next(part["inline_data"] for part in parts if "inline_data" in part)
    assert inline["mime_type"] == "image/jpeg"
    assert base64.b64decode(inline["data"]) == JPEG.data
    assert body["generationConfig"]["responseSchema"] == SCHEMA
    assert body["generationConfig"]["responseMimeType"] == "application/json"


def test_gemini_parses_the_model_text_as_json():
    payload = {
        "candidates": [
            {"content": {"parts": [{"text": json.dumps({"titles": ["Dune"]})}]}}
        ]
    }
    assert GeminiProvider(api_key="k")._parse(payload) == {"titles": ["Dune"]}


def test_gemini_joins_text_split_across_parts():
    payload = {
        "candidates": [
            {"content": {"parts": [{"text": '{"titles":'}, {"text": ' ["Dune"]}'}]}}
        ]
    }
    assert GeminiProvider(api_key="k")._parse(payload) == {"titles": ["Dune"]}


def test_output_that_is_not_json_raises_llm_error():
    # Schema enforcement makes this rare, not impossible -- a truncated
    # response is still cut-off JSON. It must not escape as a ValueError from
    # inside a parser.
    payload = {"candidates": [{"content": {"parts": [{"text": "sorry, I can't"}]}}]}
    with pytest.raises(LLMError):
        GeminiProvider(api_key="k")._parse(payload)


def test_empty_candidates_raises_llm_error():
    with pytest.raises(LLMError):
        GeminiProvider(api_key="k")._parse({"candidates": []})


def test_anthropic_content_puts_images_before_the_instruction():
    content = AnthropicProvider(api_key="k")._build_content("read them", [JPEG])

    assert content[0]["type"] == "image"
    assert content[0]["source"]["media_type"] == "image/jpeg"
    assert base64.b64decode(content[0]["source"]["data"]) == JPEG.data
    assert content[-1] == {"type": "text", "text": "read them"}


def test_anthropic_unparseable_output_raises_llm_error():
    with pytest.raises(LLMError):
        AnthropicProvider(api_key="k")._parse("not json")


def test_oversized_payload_is_refused_before_the_request_is_sent():
    # Gemini caps the whole inline request at 20 MB. Failing here names the
    # cause; letting the API reject it returns an opaque 400.
    images = [Image("image/jpeg", b"x" * (MAX_REQUEST_BYTES // 2)) for _ in range(4)]
    with pytest.raises(LLMError) as excinfo:
        guard_payload_size(images)
    assert "20 MB" in str(excinfo.value)


def test_a_reasonable_payload_passes_the_guard():
    guard_payload_size([Image("image/jpeg", b"x" * 1024)])


def test_build_provider_selects_by_configuration():
    gemini = build_provider(_config(llm_provider="gemini", gemini_api_key="g"))
    assert isinstance(gemini, GeminiProvider)

    anthropic_provider = build_provider(
        _config(llm_provider="anthropic", anthropic_api_key="a")
    )
    assert isinstance(anthropic_provider, AnthropicProvider)


def test_build_provider_names_the_missing_key():
    with pytest.raises(LLMError) as excinfo:
        build_provider(_config(llm_provider="gemini"))
    assert "GEMINI_API_KEY" in str(excinfo.value)


def test_build_provider_rejects_an_unknown_provider():
    with pytest.raises(LLMError) as excinfo:
        build_provider(_config(llm_provider="parrot"))
    assert "parrot" in str(excinfo.value)


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self) -> dict:
        return self._payload


class _FakeClient:
    """Stands in for httpx2.AsyncClient, returning queued responses in order."""

    def __init__(self, responses: list[_FakeResponse], calls: list[int]):
        self._responses = responses
        self._calls = calls

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False

    async def post(self, *_args, **_kwargs):
        self._calls.append(1)
        return self._responses.pop(0)


def _patch_client(monkeypatch, responses: list[_FakeResponse]) -> list[int]:
    calls: list[int] = []
    monkeypatch.setattr(
        "llm.httpx2.AsyncClient", lambda **_: _FakeClient(responses, calls)
    )
    monkeypatch.setattr("llm.RETRY_DELAY_SECONDS", 0)
    return calls


@pytest.mark.asyncio
async def test_a_transient_503_is_retried_once_and_can_succeed(monkeypatch):
    # Not hypothetical: gemini-3.7-flash really did answer 503 twice in a row
    # while listed and available. Without the retry, a perfectly good import
    # fails for a reason the user can do nothing about.
    ok = {"candidates": [{"content": {"parts": [{"text": '{"titles": ["Dune"]}'}]}}]}
    calls = _patch_client(monkeypatch, [_FakeResponse(503), _FakeResponse(200, ok)])

    result = await GeminiProvider(api_key="k").complete_json("go", SCHEMA)

    assert result == {"titles": ["Dune"]}
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_a_second_failure_gives_up_rather_than_looping(monkeypatch):
    calls = _patch_client(monkeypatch, [_FakeResponse(503), _FakeResponse(503)])

    with pytest.raises(LLMError):
        await GeminiProvider(api_key="k").complete_json("go", SCHEMA)

    assert len(calls) == 2


@pytest.mark.asyncio
async def test_a_bad_request_is_not_retried(monkeypatch):
    # 400 means the request itself is wrong. Sending it again wastes free-tier
    # quota to get the same answer.
    calls = _patch_client(monkeypatch, [_FakeResponse(400)])

    with pytest.raises(LLMError):
        await GeminiProvider(api_key="k").complete_json("go", SCHEMA)

    assert len(calls) == 1


@pytest.mark.asyncio
async def test_rate_limiting_says_so_in_words_the_ui_can_show(monkeypatch):
    _patch_client(monkeypatch, [_FakeResponse(429), _FakeResponse(429)])

    with pytest.raises(LLMError) as excinfo:
        await GeminiProvider(api_key="k").complete_json("go", SCHEMA)

    assert "try again" in str(excinfo.value).lower()
