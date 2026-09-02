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
    GEMINI_MODELS,
    MAX_REQUEST_BYTES,
    AnthropicProvider,
    GeminiProvider,
    Image,
    LLMError,
    build_provider,
    guard_payload_size,
    to_gemini_schema,
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
    assert body["generationConfig"]["responseMimeType"] == "application/json"

    sent = body["generationConfig"]["responseSchema"]
    assert sent["properties"] == SCHEMA["properties"]
    assert sent["required"] == SCHEMA["required"]


def test_gemini_schema_drops_keys_gemini_refuses():
    # Not cosmetic. Gemini answers 400 "Unknown name additionalProperties ...
    # Cannot find field" rather than ignoring it, while Anthropic requires the
    # same key. Verified against the live API.
    nested = {
        "type": "object",
        "additionalProperties": False,
        "title": "Detections",
        "properties": {
            "detections": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {"title": {"type": "string"}},
                    "required": ["title"],
                },
            }
        },
        "required": ["detections"],
    }

    cleaned = to_gemini_schema(nested)

    assert "additionalProperties" not in cleaned
    assert "title" not in cleaned
    assert "additionalProperties" not in cleaned["properties"]["detections"]["items"]
    # Everything that matters survives, including at depth.
    assert cleaned["required"] == ["detections"]
    assert cleaned["properties"]["detections"]["items"]["required"] == ["title"]
    assert cleaned["properties"]["detections"]["items"]["properties"] == {
        "title": {"type": "string"}
    }


def test_the_canonical_schema_is_not_mutated_by_translation():
    # Anthropic gets the original and needs additionalProperties intact.
    original = {"type": "object", "additionalProperties": False, "properties": {}}
    to_gemini_schema(original)
    assert original["additionalProperties"] is False


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

    def __init__(self, responses: list[_FakeResponse], calls: list[str]):
        self._responses = responses
        self._calls = calls

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False

    async def post(self, url, **_kwargs):
        # Record which model each call went to: the fallback chain is the
        # thing most of these tests are actually about.
        self._calls.append(url.split("/models/")[-1].split(":")[0])
        # The last queued response repeats, so a test that cares about "keeps
        # failing" need not count the exact number of attempts up front.
        return (
            self._responses.pop(0) if len(self._responses) > 1 else self._responses[0]
        )


def _patch_client(monkeypatch, responses: list[_FakeResponse]) -> list[str]:
    calls: list[str] = []
    monkeypatch.setattr(
        "llm.httpx2.AsyncClient", lambda **_: _FakeClient(responses, calls)
    )
    monkeypatch.setattr("llm.RETRY_DELAYS_SECONDS", (0, 0, 0))
    return calls


def _quota_body(quota_id: str) -> dict:
    """A 429 body shaped the way Google actually sends one."""
    return {
        "error": {
            "code": 429,
            "message": "You exceeded your current quota",
            "details": [
                {
                    "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                    "violations": [{"quotaId": quota_id, "quotaValue": "20"}],
                }
            ],
        }
    }


@pytest.mark.asyncio
async def test_a_transient_503_is_retried_and_can_succeed(monkeypatch):
    # Not hypothetical: gemini-3.7-flash really did answer 503 on consecutive
    # live calls while listed and available, and a real photo import failed
    # this way. Without the retry a good import fails for a reason the person
    # holding the phone can do nothing about.
    ok = {"candidates": [{"content": {"parts": [{"text": '{"titles": ["Dune"]}'}]}}]}
    calls = _patch_client(
        monkeypatch, [_FakeResponse(503), _FakeResponse(503), _FakeResponse(200, ok)]
    )

    result = await GeminiProvider(api_key="k").complete_json("go", SCHEMA)

    assert result == {"titles": ["Dune"]}
    assert len(calls) == 3


@pytest.mark.asyncio
async def test_an_overloaded_model_falls_through_to_the_next(monkeypatch):
    # The failure that actually happened: gemini-3.7-flash answered 503 on
    # real photo imports while 3.6 and 3.5 served the same image request. The
    # quota is per model too, so falling through buys availability and budget
    # at once.
    ok = {"candidates": [{"content": {"parts": [{"text": '{"titles": ["Dune"]}'}]}}]}
    calls = _patch_client(
        monkeypatch,
        [_FakeResponse(503)] * 4 + [_FakeResponse(200, ok)],
    )

    result = await GeminiProvider(api_key="k").complete_json("go", SCHEMA)

    assert result == {"titles": ["Dune"]}
    assert calls[0] == GEMINI_MODELS[0]
    assert calls[-1] == GEMINI_MODELS[1]


@pytest.mark.asyncio
async def test_an_exhausted_model_also_falls_through(monkeypatch):
    # A daily quota is spent per model, so 429 is a reason to try the next
    # one rather than to stop.
    ok = {"candidates": [{"content": {"parts": [{"text": '{"titles": ["Dune"]}'}]}}]}
    calls = _patch_client(
        monkeypatch,
        [
            _FakeResponse(429, _quota_body("GenerateRequestsPerDay")),
            _FakeResponse(200, ok),
        ],
    )

    assert await GeminiProvider(api_key="k").complete_json("go", SCHEMA) == {
        "titles": ["Dune"]
    }
    # One call to the exhausted model -- not retried -- then the next.
    assert calls == [GEMINI_MODELS[0], GEMINI_MODELS[1]]


@pytest.mark.asyncio
async def test_sustained_overload_across_every_model_gives_up(monkeypatch):
    calls = _patch_client(monkeypatch, [_FakeResponse(503)])

    with pytest.raises(LLMError) as excinfo:
        await GeminiProvider(api_key="k").complete_json("go", SCHEMA)

    # Four attempts per model -- one more than there are delays, since the
    # last is not followed by a wait -- across every model in the chain.
    assert len(calls) == 4 * len(GEMINI_MODELS)
    assert set(calls) == set(GEMINI_MODELS)
    assert "overloaded" in str(excinfo.value).lower()


@pytest.mark.asyncio
async def test_a_pinned_model_does_not_fall_through(monkeypatch):
    calls = _patch_client(monkeypatch, [_FakeResponse(503)])

    with pytest.raises(LLMError):
        await GeminiProvider(api_key="k", model="gemini-3.6-flash").complete_json(
            "go", SCHEMA
        )

    assert set(calls) == {"gemini-3.6-flash"}


@pytest.mark.asyncio
async def test_a_bad_request_is_not_retried(monkeypatch):
    # 400 means the request itself is wrong. Sending it again spends another
    # of the twenty daily requests to get the same answer.
    calls = _patch_client(monkeypatch, [_FakeResponse(400)])

    with pytest.raises(LLMError):
        await GeminiProvider(api_key="k").complete_json("go", SCHEMA)

    assert len(calls) == 1


@pytest.mark.asyncio
async def test_rate_limiting_is_never_retried_on_the_same_model(monkeypatch):
    # A quota measured per day does not refill in the seconds a retry waits,
    # so retrying the same model spends a request to be told the same thing.
    # Moving to the next model is different -- that is a fresh quota.
    calls = _patch_client(monkeypatch, [_FakeResponse(429)])

    with pytest.raises(LLMError):
        await GeminiProvider(api_key="k").complete_json("go", SCHEMA)

    assert calls == list(GEMINI_MODELS)


@pytest.mark.asyncio
async def test_a_daily_quota_says_so_rather_than_try_again_shortly(monkeypatch):
    # "Try again shortly" is true of a per-minute limit and a lie about a
    # per-day one -- it would send someone retrying for hours against a quota
    # that resets at midnight.
    _patch_client(
        monkeypatch,
        [
            _FakeResponse(
                429,
                _quota_body("GenerateRequestsPerDayPerProjectPerModel-FreeTier"),
            )
        ],
    )

    with pytest.raises(LLMError) as excinfo:
        await GeminiProvider(api_key="k").complete_json("go", SCHEMA)

    message = str(excinfo.value)
    assert "per day" in message
    assert "shortly" not in message
    # The escape hatch is named, because it is the actionable part.
    assert "anthropic" in message.lower()


@pytest.mark.asyncio
async def test_a_per_minute_quota_says_wait_a_minute(monkeypatch):
    _patch_client(
        monkeypatch,
        [_FakeResponse(429, _quota_body("GenerateRequestsPerMinutePerProject"))],
    )

    with pytest.raises(LLMError) as excinfo:
        await GeminiProvider(api_key="k").complete_json("go", SCHEMA)

    assert "minute" in str(excinfo.value).lower()


@pytest.mark.asyncio
async def test_a_429_with_no_quota_detail_still_reads_sensibly(monkeypatch):
    _patch_client(monkeypatch, [_FakeResponse(429, {"error": {"code": 429}})])

    with pytest.raises(LLMError) as excinfo:
        await GeminiProvider(api_key="k").complete_json("go", SCHEMA)

    assert "rate limit" in str(excinfo.value).lower()
