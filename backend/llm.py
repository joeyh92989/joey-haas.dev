"""A single seam over the two LLM providers.

One method, deliberately. This is a seam, not a framework: the application
needs JSON conforming to a schema, optionally derived from images, and nothing
else. Both providers enforce the schema server-side -- Gemini through
responseSchema, Anthropic through output_config.format -- so neither returns
prose that has to be salvaged with a regex.

Images are passed inline as base64 and are not kept beyond the request.
(Starlette spools an upload over 1 MB to a temporary file while the request
is open; it is removed when the request ends.) Render's free tier has an
ephemeral disk, so anything kept there is lost on restart while still being a
data-retention surface, and the photographs have no value once the titles
have been read off them.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
from dataclasses import dataclass
from time import monotonic
from typing import Protocol

import httpx2

from config import Config

logger = logging.getLogger(__name__)

# Gemini caps the whole inline request -- prompt, schema, and image bytes -- at
# 20 MB. Base64 inflates by 4/3, so the guard measures the encoded size.
MAX_REQUEST_BYTES = 20 * 1024 * 1024

# Vision extraction over several photographs is slow; this is not a chat.
TIMEOUT = 120.0

GEMINI_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"

# Tried in order. Not a preference list -- a survival list.
#
# gemini-3.7-flash is the newest and the most contended: two real photo
# imports failed against it with 503 while 3.6 and 3.5 answered the same
# image request with 200. Both facts were measured, not assumed.
#
# The free-tier quota is per project *per model*, so falling through also
# multiplies the daily budget rather than merely dodging an outage.
# gemini-flash-latest is deliberately absent: it aliases 3.7 and shares its
# quota, so it would be a second name for the same exhausted bucket.
GEMINI_MODELS = (
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
)
DEFAULT_GEMINI_MODEL = GEMINI_MODELS[0]
DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5"
MAX_TOKENS = 8000

# Overload, not rate limiting. gemini-3.7-flash returns 503 while listed and
# available, in bursts lasting tens of seconds rather than milliseconds -- a
# real import failed on one photo this way.
#
# An overloaded model that has another model behind it gets ONE attempt and
# then the chain moves on. Backing off was first added to ride out those
# bursts, but on 2026-11-11 it was the bursts that broke everything: 3.7 timed
# out, answered 503, timed out again, and its retries spent the whole budget,
# so 3.6 and 3.5 -- healthy all along -- were never asked, and intake reads,
# Discover and closet tagging all failed. A burst that lasts tens of seconds
# is better answered by the next model now than by the same one later.
#
# The back-off below is therefore kept only for the last model in the chain
# (and so for a pinned model, which is a chain of one): with nothing left to
# fall through to, waiting out a burst is still what turns it into a slow
# success instead of a mystifying failure.
OVERLOAD_STATUSES = frozenset({500, 502, 503, 504})
RETRY_DELAYS_SECONDS = (2.0, 5.0, 10.0)

# 429 is deliberately NOT retried, and the reason is the daily cap below: a
# quota measured per day does not refill within the seconds a retry would
# wait, so retrying spends the next request to be told the same thing and
# delays the honest answer to whoever is waiting.
RATE_LIMIT_STATUS = 429

# A ceiling on the whole chain, not on one attempt.
#
# TIMEOUT is per request, and without a ceiling the chain could legitimately
# run for many minutes with nothing anywhere saying stop. A real three-photo
# import once took seven to eight minutes and returned no feedback the entire
# time.
#
# The budget is shared out, not first come first served. Each model may use at
# most an even share of what is left when it is reached -- the remaining budget
# divided by the models still to try -- and every request's timeout is capped
# by that share, so a model that hangs gives up its turn instead of the whole
# chain's. A model that answers quickly leaves its unused time to the ones
# after it rather than wasting it, which is why the share is recomputed rather
# than fixed at TOTAL_BUDGET_SECONDS / len(models): a slow but healthy vision
# request on the second model should not be cut off at 50s while 100s sit
# unused. Since every earlier model is capped at its share, each later model is
# still guaranteed at least TOTAL_BUDGET_SECONDS / len(models). The last model
# may use whatever is left.
#
# Enforced through the request timeout and checked between attempts, never by
# cancelling a request mid-flight: that throws away work already paid for.
TOTAL_BUDGET_SECONDS = 150.0

# The shortest request worth sending. A share with less than this left is
# treated as spent: a few seconds is not long enough for a vision request to
# answer, so sending one would only use up a daily request for nothing.
MIN_ATTEMPT_SECONDS = 5.0

# Measured against the live API, because Google does not publish it: the free
# tier allows twenty generate_content requests per day, per project, per
# model (quota id GenerateRequestsPerDayPerProjectPerModel-FreeTier). Not per
# minute. That is roughly twenty photographs a day, which is worth knowing
# before planning to backfill a shelf in one sitting.
FREE_TIER_DAILY_REQUESTS = 20


class LLMError(RuntimeError):
    """The provider failed, timed out, or returned something unusable."""


@dataclass(frozen=True)
class Image:
    """One image to reason over. `data` is raw bytes, not base64."""

    media_type: str
    data: bytes


def guard_payload_size(images: list[Image]) -> None:
    """Refuses a request that cannot succeed.

    Checked here rather than left to the provider so the error names the cause.
    The provider's own rejection is an opaque 400 arriving a long way from the
    upload that caused it.
    """
    encoded = sum(len(base64.b64encode(image.data)) for image in images)
    if encoded > MAX_REQUEST_BYTES:
        raise LLMError(
            f"images total {encoded // (1024 * 1024)} MB once encoded, over the "
            "20 MB inline request limit — upload fewer photos per batch"
        )


# Gemini's responseSchema is a subset of JSON Schema and rejects anything it
# does not know by name, with a 400 rather than by ignoring it. Anthropic's
# structured outputs require additionalProperties: false. Callers therefore
# write one canonical JSON Schema and each provider translates -- which is the
# whole reason this seam exists.
GEMINI_UNSUPPORTED_KEYS = frozenset(
    {
        "additionalProperties",
        "$schema",
        "$defs",
        "definitions",
        "default",
        "examples",
        "title",
    }
)


def to_gemini_schema(schema: dict) -> dict:
    """The same schema with the keys Gemini refuses removed.

    Recursive because the offending key appears at every object level, and
    Gemini reports each one separately as "Cannot find field".

    Keys inside `properties` are field names chosen by the caller, not schema
    keywords, and are never filtered. Without that distinction a field
    legitimately named "title" would be stripped out of the schema -- which is
    exactly the field the detection schema depends on.
    """
    cleaned: dict = {}
    for key, value in schema.items():
        if key in GEMINI_UNSUPPORTED_KEYS:
            continue

        if key == "properties" and isinstance(value, dict):
            cleaned[key] = {
                name: to_gemini_schema(subschema)
                if isinstance(subschema, dict)
                else subschema
                for name, subschema in value.items()
            }
        elif isinstance(value, dict):
            cleaned[key] = to_gemini_schema(value)
        elif isinstance(value, list):
            cleaned[key] = [
                to_gemini_schema(entry) if isinstance(entry, dict) else entry
                for entry in value
            ]
        else:
            cleaned[key] = value
    return cleaned


def _quota_id(body: dict | None) -> str:
    """The QuotaFailure violation's quotaId in a 429 body, or ""."""
    quota_id = ""
    for detail in ((body or {}).get("error") or {}).get("details") or []:
        for violation in detail.get("violations") or []:
            quota_id = violation.get("quotaId") or quota_id
    return quota_id


def _is_per_day(body: dict | None) -> bool:
    """Whether a 429 body names a per-day quota (resets at midnight Pacific)."""
    return "PerDay" in _quota_id(body)


def _quota_message(body: dict | None, tried: int = 1) -> str:
    """A 429 explained in terms of which limit was actually hit.

    "Try again shortly" is true of a per-minute limit and a lie about a
    per-day one. Google reports the difference in a QuotaFailure detail, so
    the distinction is available rather than guessable -- and getting it wrong
    sends someone retrying for hours against a quota that resets at midnight.
    """
    quota_id = _quota_id(body)
    if "PerDay" in quota_id:
        models = "every model tried" if tried > 1 else "this model"
        return (
            f"Gemini's free tier allows {FREE_TIER_DAILY_REQUESTS} requests per "
            f"day per model, and {models} is used up. It resets at midnight "
            "Pacific — or set LLM_PROVIDER=anthropic, which has no daily cap."
        )
    if quota_id:
        return "Gemini rate limit reached — wait a minute and try again"
    return "Gemini rate limit reached — try again shortly"


class LLMProvider(Protocol):
    """What the importer needs from a model."""

    async def complete_json(
        self, prompt: str, schema: dict, images: list[Image] | None = None
    ) -> dict: ...


class GeminiProvider:
    """Gemini via REST.

    Free-tier request limits are not published -- the documentation defers to
    the AI Studio dashboard -- so 429 is treated as an expected outcome rather
    than an exceptional one, and reaches the UI as "try again".
    """

    def __init__(self, api_key: str, model: str | None = None, recorder=None) -> None:
        self._api_key = api_key
        # intake.budget.UsageRecorder, or None: counts each attempt and marks
        # a model exhausted on a per-day 429 (intake spec D3).
        self._recorder = recorder
        # A named model pins the request to it; the default falls through the
        # chain, which is what makes an overloaded or exhausted model
        # survivable rather than fatal.
        self._models = (model,) if model else GEMINI_MODELS

    def _build_body(self, prompt: str, schema: dict, images: list[Image]) -> dict:
        parts: list[dict] = [{"text": prompt}]
        for image in images:
            parts.append(
                {
                    "inline_data": {
                        "mime_type": image.media_type,
                        "data": base64.b64encode(image.data).decode("ascii"),
                    }
                }
            )
        return {
            "contents": [{"parts": parts}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": to_gemini_schema(schema),
            },
        }

    def _parse(self, payload: dict) -> dict:
        candidates = payload.get("candidates") or []
        if not candidates:
            raise LLMError("Gemini returned no candidates")
        parts = (candidates[0].get("content") or {}).get("parts") or []
        text = "".join(part.get("text", "") for part in parts)
        try:
            return json.loads(text)
        except json.JSONDecodeError as error:
            # Schema enforcement makes this rare, not impossible: a truncated
            # response is still cut-off JSON. It must not surface as a
            # ValueError from inside a parser.
            raise LLMError(f"Gemini returned unparseable JSON: {error}") from error

    async def complete_json(
        self, prompt: str, schema: dict, images: list[Image] | None = None
    ) -> dict:
        images = images or []
        guard_payload_size(images)
        body = self._build_body(prompt, schema, images)

        last_status: int | None = None
        last_body: dict | None = None
        timed_out = False
        # Models that were actually sent a request -- the N in "across N
        # models". Claiming three were tried when the budget went during the
        # first is a small lie that would send someone looking in the wrong
        # place.
        tried = 0
        budget_ran_out = False
        started = monotonic()

        def spent() -> float:
            return monotonic() - started

        def gave_up(elapsed: float) -> LLMError:
            return LLMError(
                f"Gave up after {elapsed:.0f}s across {tried} "
                f"model{'s' if tried != 1 else ''} — try again with fewer "
                "photos"
            )

        for index, model in enumerate(self._models):
            now = spent()
            if now > TOTAL_BUDGET_SECONDS:
                raise gave_up(now)

            # This model's share of what is left (see TOTAL_BUDGET_SECONDS).
            # For the last model that is all of it.
            models_left = len(self._models) - index
            share_ends = now + (TOTAL_BUDGET_SECONDS - now) / models_left
            is_last = models_left == 1
            # Only the last model waits out an overload (see
            # OVERLOAD_STATUSES); any other moves on after one attempt. One
            # attempt more than there are delays: the final attempt is not
            # followed by a wait.
            attempts = len(RETRY_DELAYS_SECONDS) + 1 if is_last else 1

            for attempt in range(attempts):
                # Never longer than this model's share has left, which is
                # never longer than the whole budget has left: a hanging
                # request would otherwise take the next model's turn.
                allowed = min(TIMEOUT, share_ends - (now if attempt == 0 else spent()))
                if allowed < MIN_ATTEMPT_SECONDS:
                    budget_ran_out = True
                    break
                if attempt == 0:
                    tried += 1
                try:
                    async with httpx2.AsyncClient(timeout=allowed) as client:
                        if self._recorder is not None:
                            await self._recorder.attempt(model)
                        response = await client.post(
                            f"{GEMINI_ROOT}/{model}:generateContent",
                            json=body,
                            headers={"x-goog-api-key": self._api_key},
                        )
                except httpx2.TimeoutException as error:
                    # The same outage as a 504, so handled like one, within
                    # the same share.
                    logger.info(
                        "gemini %s attempt %d timed out: %s", model, attempt + 1, error
                    )
                    last_status, last_body, timed_out = 504, None, True
                    if attempt < attempts - 1:
                        await asyncio.sleep(RETRY_DELAYS_SECONDS[attempt])
                        continue
                    break
                except httpx2.HTTPError as error:
                    raise LLMError(f"Gemini request failed: {error}") from error

                logger.info(
                    "gemini %s attempt %d -> %s (%d images)",
                    model,
                    attempt + 1,
                    response.status_code,
                    len(images),
                )

                timed_out = False
                if response.status_code < 400:
                    try:
                        payload = response.json()
                    except ValueError as error:
                        # Not an LLMError otherwise, so Discover's template
                        # fallback would not run and the route would 500.
                        raise LLMError(
                            f"Gemini returned a body that is not JSON: {error}"
                        ) from error
                    return self._parse(payload)

                last_status = response.status_code
                try:
                    last_body = response.json()
                except ValueError:
                    last_body = None
                if (
                    self._recorder is not None
                    and response.status_code == RATE_LIMIT_STATUS
                    and _is_per_day(last_body)
                ):
                    await self._recorder.exhausted(model)

                if response.status_code in OVERLOAD_STATUSES and attempt < attempts - 1:
                    await asyncio.sleep(RETRY_DELAYS_SECONDS[attempt])
                    continue
                break

            # Overload and an exhausted quota are both properties of one
            # model, not of Gemini, so both are worth trying the next one for.
            # So is a spent share: it says nothing about the next model.
            # Anything else -- a malformed request, a bad key -- would fail
            # identically everywhere and is not worth the extra calls.
            if (
                last_status in OVERLOAD_STATUSES
                or last_status == RATE_LIMIT_STATUS
                or budget_ran_out
            ):
                logger.info("gemini falling through from %s (%s)", model, last_status)
                continue
            break

        if budget_ran_out and last_status != RATE_LIMIT_STATUS:
            # Time, not the models, is what ran out.
            raise gave_up(spent())
        if last_status == RATE_LIMIT_STATUS:
            raise LLMError(_quota_message(last_body, tried=len(self._models)))
        if timed_out:
            # No response came back, so no HTTP status to report.
            raise LLMError(
                f"Gemini did not answer in time — tried {', '.join(self._models)}. "
                "Try again in a few minutes."
            )
        if last_status in OVERLOAD_STATUSES:
            raise LLMError(
                f"Gemini is overloaded (HTTP {last_status}) — tried "
                f"{', '.join(self._models)} and none recovered. Try again in a "
                "few minutes."
            )
        raise LLMError(f"Gemini returned HTTP {last_status}")


class AnthropicProvider:
    """Anthropic via the official SDK.

    The SDK is imported lazily so a Gemini-only deploy never loads it.
    """

    def __init__(self, api_key: str, model: str = DEFAULT_ANTHROPIC_MODEL) -> None:
        self._api_key = api_key
        self._model = model

    def _build_content(self, prompt: str, images: list[Image]) -> list[dict]:
        content: list[dict] = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": image.media_type,
                    "data": base64.b64encode(image.data).decode("ascii"),
                },
            }
            for image in images
        ]
        # Text after the images: the instruction reads better once the model
        # has the pictures it refers to.
        content.append({"type": "text", "text": prompt})
        return content

    def _parse(self, text: str) -> dict:
        try:
            return json.loads(text)
        except json.JSONDecodeError as error:
            raise LLMError(f"Anthropic returned unparseable JSON: {error}") from error

    async def complete_json(
        self, prompt: str, schema: dict, images: list[Image] | None = None
    ) -> dict:
        import anthropic

        images = images or []
        guard_payload_size(images)

        # A client per call, closed with it: an unclosed one leaks its pool.
        async with anthropic.AsyncAnthropic(
            api_key=self._api_key, timeout=TIMEOUT
        ) as client:
            try:
                response = await client.messages.create(
                    model=self._model,
                    max_tokens=MAX_TOKENS,
                    messages=[
                        {
                            "role": "user",
                            "content": self._build_content(prompt, images),
                        }
                    ],
                    output_config={"format": {"type": "json_schema", "schema": schema}},
                )
            except anthropic.APIError as error:
                raise LLMError(f"Anthropic request failed: {error}") from error

        logger.info(
            "anthropic %s -> %s (%d images)",
            self._model,
            response.stop_reason,
            len(images),
        )
        text = next((b.text for b in response.content if b.type == "text"), "")
        return self._parse(text)


def build_provider(config: Config, recorder=None) -> LLMProvider:
    """The provider named by LLM_PROVIDER, or an error naming what is missing.

    Built per request rather than at import, so an absent key is a failure of
    the one route that needs a model rather than a service that will not boot.
    """
    provider = (config.llm_provider or "gemini").lower()
    if provider == "gemini":
        if not config.gemini_api_key:
            raise LLMError("LLM_PROVIDER is gemini but GEMINI_API_KEY is not set")
        return GeminiProvider(config.gemini_api_key, recorder=recorder)
    if provider == "anthropic":
        if not config.anthropic_api_key:
            raise LLMError("LLM_PROVIDER is anthropic but ANTHROPIC_API_KEY is not set")
        return AnthropicProvider(config.anthropic_api_key)
    raise LLMError(f"unknown LLM_PROVIDER {provider!r}: expected gemini or anthropic")
