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
import itertools
import json

import httpx2
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
        queued = (
            self._responses.pop(0) if len(self._responses) > 1 else self._responses[0]
        )
        if isinstance(queued, Exception):
            raise queued
        return queued


def _patch_client(monkeypatch, responses: list[_FakeResponse]) -> list[str]:
    calls: list[str] = []
    monkeypatch.setattr(
        "llm.httpx2.AsyncClient", lambda **_: _FakeClient(responses, calls)
    )
    monkeypatch.setattr("llm.RETRY_DELAY_SECONDS", 0)
    return calls


def _patch_clock(monkeypatch, step: float) -> None:
    """Advances llm's view of the clock by `step` on every reading.

    Patches the name `llm` looks up rather than `time.monotonic` itself, which
    is the same module object asyncio reads: replacing it globally works only
    while the retry delays happen to be zero, and turns into a StopIteration
    from inside the event loop the moment they are not.
    """
    ticks = itertools.count(0.0, step)
    monkeypatch.setattr("llm.monotonic", lambda: next(ticks))


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
    # this way. With no other model to fall through to -- a pinned model, or
    # the last in the chain -- the retry is what keeps a good import from
    # failing for a reason the person holding the phone can do nothing about.
    ok = {"candidates": [{"content": {"parts": [{"text": '{"titles": ["Dune"]}'}]}}]}
    calls = _patch_client(monkeypatch, [_FakeResponse(503), _FakeResponse(200, ok)])

    result = await GeminiProvider(api_key="k", model=GEMINI_MODELS[0]).complete_json(
        "go", SCHEMA
    )

    assert result == {"titles": ["Dune"]}
    assert calls == [GEMINI_MODELS[0]] * 2


@pytest.mark.asyncio
async def test_an_overloaded_model_is_retried_at_most_once(monkeypatch):
    # One retry, not a back-off schedule: with six models and a paid link,
    # moving on is cheaper than waiting.
    calls = _patch_client(monkeypatch, [_FakeResponse(503)])

    with pytest.raises(LLMError, match="overloaded"):
        await GeminiProvider(api_key="k", model=GEMINI_MODELS[0]).complete_json(
            "go", SCHEMA
        )

    assert calls == [GEMINI_MODELS[0]] * 2


@pytest.mark.asyncio
async def test_an_overloaded_model_falls_through_to_the_next(monkeypatch):
    # The failure that actually happened: gemini-3.7-flash answered 503 on
    # real photo imports while 3.6 and 3.5 served the same image request. The
    # quota is per model too, so falling through buys availability and budget
    # at once.
    ok = {"candidates": [{"content": {"parts": [{"text": '{"titles": ["Dune"]}'}]}}]}
    calls = _patch_client(monkeypatch, [_FakeResponse(503), _FakeResponse(200, ok)])

    result = await GeminiProvider(api_key="k").complete_json("go", SCHEMA)

    assert result == {"titles": ["Dune"]}
    # One attempt on the overloaded model, not a back-off: the next model
    # answering now beats the same one perhaps answering later.
    assert calls == [GEMINI_MODELS[0], GEMINI_MODELS[1]]


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

    # One attempt on every model but the last, which has nothing to fall
    # through to and so gets one retry.
    assert calls == list(GEMINI_MODELS[:-1]) + [GEMINI_MODELS[-1]] * 2
    assert set(calls) == set(GEMINI_MODELS)
    assert "overloaded" in str(excinfo.value).lower()


@pytest.mark.asyncio
async def test_the_chain_stops_once_the_budget_is_spent(monkeypatch):
    # Without this, four attempts across three models at a 120s timeout each
    # could legitimately run twenty-four minutes with nothing saying stop. A
    # real three-photo import took seven to eight minutes and gave no feedback
    # the whole time.
    calls = _patch_client(monkeypatch, [_FakeResponse(503)])
    # Jumps a minute per reading, so the budget runs out partway through the
    # chain rather than before it starts -- the case that actually happens.
    _patch_clock(monkeypatch, step=60.0)
    monkeypatch.setattr("llm.TOTAL_BUDGET_SECONDS", 150.0)

    with pytest.raises(LLMError) as excinfo:
        await GeminiProvider(api_key="k").complete_json("go", SCHEMA)

    # It stops rather than walking every model to the end.
    assert set(calls) != set(GEMINI_MODELS)
    assert "gave up after" in str(excinfo.value).lower()


@pytest.mark.asyncio
async def test_the_budget_does_not_cut_a_run_that_fits(monkeypatch):
    # A ceiling, not a schedule. Uses a clock that advances well inside the
    # budget, so this fails if the check is ever made too eager -- patching it
    # to the production default would have asserted nothing.
    ok = {"candidates": [{"content": {"parts": [{"text": '{"titles": ["Dune"]}'}]}}]}
    calls = _patch_client(monkeypatch, [_FakeResponse(503), _FakeResponse(200, ok)])
    _patch_clock(monkeypatch, step=10.0)
    monkeypatch.setattr("llm.TOTAL_BUDGET_SECONDS", 150.0)

    assert await GeminiProvider(api_key="k").complete_json("go", SCHEMA) == {
        "titles": ["Dune"]
    }
    # Retried within budget rather than being cut off after the first failure.
    assert len(calls) == 2


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
    # When it comes back is the actionable part. Paying is not offered: the
    # site runs free (LLM_PAID_FALLBACK is off by default).
    assert "midnight Pacific" in message
    assert "anthropic" not in message.lower()


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


class _NotJsonResponse(_FakeResponse):
    def json(self) -> dict:
        raise ValueError("Expecting value: line 1 column 1")


@pytest.mark.asyncio
async def test_a_timeout_is_retried_like_a_504(monkeypatch):
    ok = {"candidates": [{"content": {"parts": [{"text": '{"titles": ["Dune"]}'}]}}]}
    calls = _patch_client(
        monkeypatch,
        [httpx2.ReadTimeout("read timed out"), _FakeResponse(200, ok)],
    )

    result = await GeminiProvider(api_key="k").complete_json("go", SCHEMA)

    assert result == {"titles": ["Dune"]}
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_a_2xx_that_is_not_json_is_an_llm_error(monkeypatch):
    # A ValueError here would skip Discover's template fallback and 500.
    _patch_client(monkeypatch, [_NotJsonResponse(200)])
    with pytest.raises(LLMError, match="not JSON"):
        await GeminiProvider(api_key="k").complete_json("go", SCHEMA)


@pytest.mark.asyncio
async def test_timeouts_everywhere_say_so_rather_than_an_http_status(monkeypatch):
    _patch_client(monkeypatch, [httpx2.ReadTimeout("read timed out")])
    with pytest.raises(LLMError, match="did not answer in time") as raised:
        await GeminiProvider(api_key="k").complete_json("go", SCHEMA)
    assert "HTTP" not in str(raised.value)


class _Clock:
    """A clock that moves only when a request or a wait would take time.

    `_patch_clock` advances on every reading, which makes the outcome depend
    on how often the loop happens to look at the time. These tests are about
    how long each model is allowed to hold the chain, so time passes where it
    would in production: inside the request and inside the back-off.
    """

    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


class _ModelClient:
    """Answers per model, and charges the clock for each request.

    A timeout costs `timeout_takes` seconds, or the timeout the client was
    actually given if that is shorter -- a request cannot outlive its own
    timeout, which is what makes "within the budget" checkable.
    """

    def __init__(self, outcomes, calls, clock, timeout, timeout_takes):
        self._outcomes = outcomes
        self._calls = calls
        self._clock = clock
        self._timeout = timeout
        self._timeout_takes = timeout_takes

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False

    async def post(self, url, **_kwargs):
        model = url.split("/models/")[-1].split(":")[0]
        self._calls.append((model, self._timeout))
        outcome = self._outcomes[model]
        if isinstance(outcome, Exception):
            self._clock.now += min(self._timeout_takes, self._timeout)
            raise outcome
        self._clock.now += 1.0
        return outcome


def _patch_models(monkeypatch, outcomes, timeout_takes=60.0):
    """Each model answers the same way every time; returns (calls, clock)."""
    calls: list[tuple[str, float]] = []
    clock = _Clock()
    monkeypatch.setattr("llm.monotonic", clock)
    monkeypatch.setattr("llm.RETRY_DELAY_SECONDS", 0)
    monkeypatch.setattr("llm.TOTAL_BUDGET_SECONDS", 150.0)
    monkeypatch.setattr(
        "llm.httpx2.AsyncClient",
        lambda timeout, **_: _ModelClient(
            outcomes, calls, clock, timeout, timeout_takes
        ),
    )
    return calls, clock


OK = {"candidates": [{"content": {"parts": [{"text": '{"titles": ["Dune"]}'}]}}]}


@pytest.mark.asyncio
async def test_a_first_model_that_keeps_timing_out_does_not_starve_the_rest(
    monkeypatch,
):
    # The production failure: the first model timed out, answered 503, timed
    # out again, and its retries spent the whole 150s budget, so the healthy
    # models behind it were never asked and every caller failed.
    first, second, *_ = GEMINI_MODELS
    calls, _ = _patch_models(
        monkeypatch,
        {
            **dict.fromkeys(GEMINI_MODELS, _FakeResponse(200, OK)),
            first: httpx2.ReadTimeout("read timed out"),
        },
    )

    assert await GeminiProvider(api_key="k").complete_json("go", SCHEMA) == {
        "titles": ["Dune"]
    }
    assert [model for model, _ in calls] == [first, second]


@pytest.mark.asyncio
async def test_a_503_moves_to_the_next_model_after_one_attempt(monkeypatch):
    first, second, *_ = GEMINI_MODELS
    calls, _ = _patch_models(
        monkeypatch,
        {
            **dict.fromkeys(GEMINI_MODELS, _FakeResponse(200, OK)),
            first: _FakeResponse(503),
        },
    )

    assert await GeminiProvider(api_key="k").complete_json("go", SCHEMA) == {
        "titles": ["Dune"]
    }
    assert [model for model, _ in calls] == [first, second]


@pytest.mark.asyncio
async def test_no_model_is_given_more_than_its_share_of_the_budget(monkeypatch):
    # The timeout handed to each request is the cap that matters: a model
    # cannot hold the chain longer than its own request is allowed to run.
    calls, _ = _patch_models(
        monkeypatch, dict.fromkeys(GEMINI_MODELS, httpx2.ReadTimeout("slow"))
    )

    with pytest.raises(LLMError):
        await GeminiProvider(api_key="k").complete_json("go", SCHEMA)

    # A third of what is left (llm.SHARE_SPREAD), never all of it: every
    # model behind a hanging one is still asked.
    timeouts = [timeout for _, timeout in calls]
    assert timeouts[0] <= 150.0 / 3
    assert all(timeout >= 5.0 for timeout in timeouts)
    assert [model for model, _ in calls] == list(TEXT_ORDER)


@pytest.mark.asyncio
async def test_every_model_overloaded_gives_up_within_the_budget(monkeypatch):
    calls, clock = _patch_models(
        monkeypatch, dict.fromkeys(GEMINI_MODELS, httpx2.ReadTimeout("slow"))
    )

    with pytest.raises(LLMError, match=f"across {len(GEMINI_MODELS)} models"):
        await GeminiProvider(api_key="k").complete_json("go", SCHEMA)

    assert {model for model, _ in calls} == set(GEMINI_MODELS)
    assert clock.now <= 150.0


# --- the fallback chain (docs/planning/2026-11-11-llm-fallback-chain-*) ------

import logging  # noqa: E402
import sys  # noqa: E402
from datetime import UTC, datetime, timedelta  # noqa: E402

import llm  # noqa: E402
from llm import (  # noqa: E402
    ANTHROPIC_RESERVE_SECONDS,
    TEXT_ORDER,
    THINKING_LEVELS,
    VISION_ORDER,
    ChainedProvider,
    ModelUnavailable,
    is_exhausted,
)
from recommendations_routes import _failure_note  # noqa: E402

LITE = {"gemini-3.5-flash-lite", "gemini-3.1-flash-lite"}


def test_text_calls_start_on_flash_lite_and_image_calls_on_flash():
    assert TEXT_ORDER[0] in LITE
    assert VISION_ORDER[0] not in LITE
    # Both orders hold every model, so either can fall all the way through.
    assert sorted(TEXT_ORDER) == sorted(VISION_ORDER) == sorted(THINKING_LEVELS)


@pytest.mark.asyncio
async def test_a_call_with_images_goes_to_the_vision_order(monkeypatch):
    calls = _patch_client(monkeypatch, [_FakeResponse(200, OK)])

    await GeminiProvider(api_key="k").complete_json("go", SCHEMA, [JPEG])

    assert calls == [VISION_ORDER[0]]


class _BodyClient(_FakeClient):
    """Records each request body alongside the model."""

    def __init__(self, responses, calls, bodies):
        super().__init__(responses, calls)
        self._bodies = bodies

    async def post(self, url, **kwargs):
        self._bodies.append(kwargs["json"])
        return await super().post(url, **kwargs)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("images", "order"), [([], TEXT_ORDER), ([JPEG], VISION_ORDER)]
)
async def test_every_request_the_walk_sends_carries_its_models_level(
    monkeypatch, images, order
):
    calls: list[str] = []
    bodies: list[dict] = []
    monkeypatch.setattr("llm.RETRY_DELAY_SECONDS", 0)
    monkeypatch.setattr(
        "llm.httpx2.AsyncClient",
        lambda **_: _BodyClient([_FakeResponse(503)], calls, bodies),
    )

    with pytest.raises(LLMError):
        await GeminiProvider(api_key="k").complete_json("go", SCHEMA, images)

    assert calls[: len(order)] == list(order)
    for model, body in zip(calls, bodies, strict=True):
        assert body["generationConfig"]["thinkingConfig"] == {
            "thinkingLevel": THINKING_LEVELS[model]
        }


@pytest.mark.asyncio
async def test_a_refused_thinking_level_is_retried_without_it(monkeypatch, caplog):
    # The probe's real answer from gemini-3.7-flash to MINIMAL.
    refused = _FakeResponse(
        400,
        {
            "error": {
                "code": 400,
                "message": "Thinking level MINIMAL is not supported for this "
                "model. Please retry with other thinking level.",
            }
        },
    )
    calls: list[str] = []
    bodies: list[dict] = []
    queue = [refused, _FakeResponse(200, OK)]
    monkeypatch.setattr(
        "llm.httpx2.AsyncClient", lambda **_: _BodyClient(queue, calls, bodies)
    )

    with caplog.at_level(logging.WARNING, logger="llm"):
        result = await GeminiProvider(api_key="k").complete_json("go", SCHEMA)

    assert result == {"titles": ["Dune"]}
    assert calls == [TEXT_ORDER[0]] * 2
    assert bodies[0]["generationConfig"]["thinkingConfig"] == {
        "thinkingLevel": THINKING_LEVELS[TEXT_ORDER[0]]
    }
    assert "thinkingConfig" not in bodies[1]["generationConfig"]
    assert "refused thinking level" in caplog.text


@pytest.mark.asyncio
async def test_a_withdrawn_model_falls_through(monkeypatch):
    # The 2.5 models answer 404 "no longer available to new users".
    calls = _patch_client(monkeypatch, [_FakeResponse(404), _FakeResponse(200, OK)])

    assert await GeminiProvider(api_key="k").complete_json("go", SCHEMA) == {
        "titles": ["Dune"]
    }
    assert calls == list(TEXT_ORDER[:2])


PER_DAY = "GenerateRequestsPerDayPerProjectPerModel-FreeTier"
PER_MINUTE = "GenerateRequestsPerMinutePerProjectPerModel-FreeTier"


@pytest.mark.asyncio
async def test_a_per_day_429_is_not_asked_again_the_same_day(monkeypatch):
    first = TEXT_ORDER[0]
    calls = _patch_client(
        monkeypatch,
        [_FakeResponse(429, _quota_body(PER_DAY)), _FakeResponse(200, OK)],
    )
    provider = GeminiProvider(api_key="k")

    await provider.complete_json("go", SCHEMA)
    await provider.complete_json("go", SCHEMA)

    assert calls == [first, TEXT_ORDER[1], TEXT_ORDER[1]]
    assert is_exhausted(first)


@pytest.mark.asyncio
async def test_a_per_minute_429_falls_through_without_marking(monkeypatch):
    first = TEXT_ORDER[0]
    calls = _patch_client(
        monkeypatch,
        [_FakeResponse(429, _quota_body(PER_MINUTE)), _FakeResponse(200, OK)],
    )
    provider = GeminiProvider(api_key="k")

    await provider.complete_json("go", SCHEMA)
    await provider.complete_json("go", SCHEMA)

    assert calls == [first, TEXT_ORDER[1], first]
    assert not is_exhausted(first)


def test_an_exhausted_model_is_asked_again_after_midnight_pacific(monkeypatch):
    # 23:30 in Los Angeles on 11 November (PST, UTC-8).
    now = datetime(2026, 11, 12, 7, 30, tzinfo=UTC)
    monkeypatch.setattr("llm._utcnow", lambda: now)
    llm.mark_exhausted("gemini-3.6-flash")
    assert is_exhausted("gemini-3.6-flash")

    monkeypatch.setattr("llm._utcnow", lambda: now + timedelta(minutes=29))
    assert is_exhausted("gemini-3.6-flash")
    monkeypatch.setattr("llm._utcnow", lambda: now + timedelta(minutes=30))
    assert not is_exhausted("gemini-3.6-flash")


@pytest.mark.asyncio
async def test_every_model_exhausted_sends_nothing_and_says_used_up(monkeypatch):
    calls = _patch_client(monkeypatch, [_FakeResponse(200, OK)])
    for model in TEXT_ORDER:
        llm.mark_exhausted(model)

    with pytest.raises(ModelUnavailable) as raised:
        await GeminiProvider(api_key="k").complete_json("go", SCHEMA)

    assert calls == []
    assert _failure_note(str(raised.value)) == "Gemini's daily quota is used up"


class _FakeAnthropic:
    """Stands in for AnthropicProvider inside the chain."""

    model = "claude-haiku-5-5"

    def __init__(self, answer=None, error: LLMError | None = None, clock=None):
        self.calls: list[dict] = []
        self._answer = answer if answer is not None else {"titles": ["Haiku"]}
        self._error = error
        self._clock = clock

    async def complete_json(self, prompt, schema, images=None, *, timeout, trace):
        self.calls.append(
            {
                "images": len(images or []),
                "timeout": timeout,
                "at": self._clock.now if self._clock else None,
            }
        )
        if self._error is not None:
            trace.note(self.model, "failed")
            raise self._error
        return self._answer


def _chain(anthropic) -> ChainedProvider:
    return ChainedProvider(GeminiProvider(api_key="k"), anthropic)


@pytest.mark.asyncio
@pytest.mark.parametrize("images", [[], [JPEG]])
async def test_haiku_answers_when_every_gemini_model_is_used_up(monkeypatch, images):
    _patch_client(monkeypatch, [_FakeResponse(429, _quota_body(PER_DAY))])
    anthropic = _FakeAnthropic()

    result = await _chain(anthropic).complete_json("go", SCHEMA, images)

    assert result == {"titles": ["Haiku"]}
    assert anthropic.calls[0]["images"] == len(images)


@pytest.mark.asyncio
async def test_gemini_answering_never_reaches_haiku(monkeypatch):
    _patch_client(monkeypatch, [_FakeResponse(200, OK)])
    anthropic = _FakeAnthropic()

    assert await _chain(anthropic).complete_json("go", SCHEMA) == {"titles": ["Dune"]}
    assert anthropic.calls == []


@pytest.mark.asyncio
async def test_a_bad_request_is_not_handed_to_the_paid_link(monkeypatch):
    _patch_client(monkeypatch, [_FakeResponse(400)])
    anthropic = _FakeAnthropic()

    with pytest.raises(LLMError, match="HTTP 400"):
        await _chain(anthropic).complete_json("go", SCHEMA)
    assert anthropic.calls == []


@pytest.mark.asyncio
async def test_with_a_paid_link_the_last_gemini_model_does_not_retry(monkeypatch):
    calls = _patch_client(monkeypatch, [_FakeResponse(503)])

    await _chain(_FakeAnthropic()).complete_json("go", SCHEMA)

    assert calls == list(TEXT_ORDER)


@pytest.mark.asyncio
async def test_gemini_hands_off_inside_its_share_of_the_budget(monkeypatch):
    calls, clock = _patch_models(
        monkeypatch, dict.fromkeys(GEMINI_MODELS, httpx2.ReadTimeout("slow"))
    )
    anthropic = _FakeAnthropic(clock=clock)

    assert await _chain(anthropic).complete_json("go", SCHEMA) == {"titles": ["Haiku"]}

    gemini_budget = 150.0 - ANTHROPIC_RESERVE_SECONDS
    assert anthropic.calls[0]["at"] <= gemini_budget
    assert anthropic.calls[0]["timeout"] >= ANTHROPIC_RESERVE_SECONDS
    assert all(timeout <= gemini_budget for _, timeout in calls)


@pytest.mark.asyncio
async def test_a_failing_paid_link_keeps_its_own_words(monkeypatch):
    _patch_client(monkeypatch, [_FakeResponse(429, _quota_body(PER_DAY))])
    overloaded = LLMError("Anthropic request failed: Error code: 529 - overloaded")

    with pytest.raises(LLMError) as raised:
        await _chain(_FakeAnthropic(error=overloaded)).complete_json("go", SCHEMA)

    assert _failure_note(str(raised.value)) == (
        "The model is overloaded; try again in a few minutes"
    )


@pytest.mark.asyncio
async def test_without_a_key_the_daily_message_still_reads_as_used_up(monkeypatch):
    _patch_client(monkeypatch, [_FakeResponse(429, _quota_body(PER_DAY))])

    with pytest.raises(LLMError) as raised:
        await GeminiProvider(api_key="k").complete_json("go", SCHEMA)

    assert _failure_note(str(raised.value)) == "Gemini's daily quota is used up"
    assert "LLM_PROVIDER=anthropic" not in str(raised.value)


def test_a_stray_anthropic_key_alone_never_adds_the_paid_link():
    # The site runs free: a key left on the service must not start billing.
    both = build_provider(
        _config(llm_provider="gemini", gemini_api_key="g", anthropic_api_key="a")
    )
    assert type(both) is GeminiProvider


def test_build_provider_chains_only_when_the_paid_fallback_is_switched_on():
    opted_in = build_provider(
        _config(
            llm_provider="gemini",
            gemini_api_key="g",
            anthropic_api_key="a",
            llm_paid_fallback=True,
        )
    )
    assert isinstance(opted_in, ChainedProvider)

    switched_on_without_a_key = build_provider(
        _config(llm_provider="gemini", gemini_api_key="g", llm_paid_fallback=True)
    )
    assert type(switched_on_without_a_key) is GeminiProvider

    anthropic_only = build_provider(
        _config(llm_provider="anthropic", gemini_api_key="g", anthropic_api_key="a")
    )
    assert isinstance(anthropic_only, AnthropicProvider)
    assert anthropic_only.model == "claude-haiku-5-5"


def _llm_info_lines(caplog) -> list[str]:
    return [
        r.getMessage()
        for r in caplog.records
        if r.name == "llm" and r.levelno == logging.INFO
    ]


@pytest.mark.asyncio
async def test_one_log_line_names_the_answer_and_what_was_skipped(monkeypatch, caplog):
    _patch_client(monkeypatch, [_FakeResponse(503), _FakeResponse(200, OK)])

    with caplog.at_level(logging.DEBUG, logger="llm"):
        await GeminiProvider(api_key="k").complete_json("go", SCHEMA)

    [line] = _llm_info_lines(caplog)
    assert line.startswith(f"llm answered by {TEXT_ORDER[1]} in ")
    assert f"skipped: {TEXT_ORDER[0]}(503)" in line


@pytest.mark.asyncio
async def test_one_log_line_for_a_hand_off_and_for_a_failure(monkeypatch, caplog):
    _patch_client(monkeypatch, [_FakeResponse(429, _quota_body(PER_DAY))])

    with caplog.at_level(logging.DEBUG, logger="llm"):
        await _chain(_FakeAnthropic()).complete_json("go", SCHEMA)
    [line] = _llm_info_lines(caplog)
    assert line.startswith("llm answered by claude-haiku-5-5 in ")
    assert f"{TEXT_ORDER[0]}(used up)" in line

    caplog.clear()
    with caplog.at_level(logging.DEBUG, logger="llm"), pytest.raises(LLMError):
        await GeminiProvider(api_key="k").complete_json("go", SCHEMA)
    [line] = _llm_info_lines(caplog)
    assert line.startswith("llm failed in ")


@pytest.mark.asyncio
async def test_a_dropped_connection_moves_on_to_the_next_free_model(monkeypatch):
    calls = _patch_client(
        monkeypatch,
        [httpx2.RemoteProtocolError("server disconnected"), _FakeResponse(200, OK)],
    )
    anthropic = _FakeAnthropic()

    result = await _chain(anthropic).complete_json("go", SCHEMA)

    assert result == {"titles": ["Dune"]}
    assert calls == list(TEXT_ORDER[:2])
    assert anthropic.calls == []


@pytest.mark.asyncio
async def test_every_model_unreachable_is_unavailable_and_goes_to_haiku(monkeypatch):
    calls = _patch_client(monkeypatch, [httpx2.ConnectError("no route")])

    with pytest.raises(llm.ModelUnavailable, match="request failed"):
        await GeminiProvider(api_key="k").complete_json("go", SCHEMA)
    assert calls == list(TEXT_ORDER)

    anthropic = _FakeAnthropic()
    assert await _chain(anthropic).complete_json("go", SCHEMA) == {"titles": ["Haiku"]}


@pytest.mark.asyncio
@pytest.mark.parametrize(("chained", "first_share"), [(False, 50.0), (True, 30.0)])
async def test_the_first_model_gets_a_third_of_the_budget_not_a_sixth(
    monkeypatch, chained, first_share
):
    calls, _ = _patch_models(
        monkeypatch, dict.fromkeys(GEMINI_MODELS, _FakeResponse(200, OK))
    )
    provider = _chain(_FakeAnthropic()) if chained else GeminiProvider(api_key="k")

    await provider.complete_json("go", SCHEMA, [JPEG])

    assert calls == [(VISION_ORDER[0], pytest.approx(first_share))]


class _FakeSDK:
    """A stand-in `anthropic` module, recording how the client is built."""

    class APIError(Exception):
        pass

    def __init__(self):
        self.client_kwargs: dict = {}
        sdk = self

        class AsyncAnthropic:
            def __init__(self, **kwargs):
                sdk.client_kwargs = kwargs
                self.messages = self

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_):
                return False

            async def create(self, **_kwargs):
                block = type("Block", (), {"type": "text", "text": '{"ok": 1}'})
                return type(
                    "Response", (), {"content": [block], "stop_reason": "end_turn"}
                )

        self.AsyncAnthropic = AsyncAnthropic


@pytest.mark.asyncio
async def test_the_paid_link_never_lets_the_sdk_retry(monkeypatch):
    sdk = _FakeSDK()
    monkeypatch.setitem(sys.modules, "anthropic", sdk)

    result = await AnthropicProvider(api_key="k").complete_json(
        "go", SCHEMA, timeout=60.0
    )

    assert result == {"ok": 1}
    assert sdk.client_kwargs["max_retries"] == 0
    assert sdk.client_kwargs["timeout"] == 60.0


@pytest.mark.parametrize(
    ("error", "note"),
    [
        (
            "Gemini unavailable, then Anthropic request failed: Error code: 500 - {}",
            "The model failed with HTTP 500; try again later",
        ),
        (
            "Gemini unavailable, then Anthropic request failed: Error code: 529 - {}",
            "The model is overloaded; try again in a few minutes",
        ),
        (
            "Gemini unavailable, then Anthropic request failed: Request timed out.",
            "The model did not answer in time; try again in a few minutes",
        ),
        (
            "Gemini no longer serves gemini-3.6-flash (HTTP 404)",
            "The model is no longer served; the chain in llm.py needs updating",
        ),
        (
            "Gemini request failed: no route",
            "The model could not be reached; try again in a few minutes",
        ),
    ],
)
def test_chain_failures_are_worded_for_the_owner(error, note):
    # Anything left as "did not answer" reads to Closet tagging as the photo's
    # fault, so every reason the chain can now raise needs its own wording.
    assert _failure_note(error) == note
