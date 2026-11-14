"""A single seam over the two LLM providers.

One method, deliberately. This is a seam, not a framework: the application
needs JSON conforming to a schema, optionally derived from images, and nothing
else. Both providers enforce the schema server-side -- Gemini through
responseSchema, Anthropic through output_config.format -- so neither returns
prose that has to be salvaged with a regex.

The free Gemini models are tried first, in an order chosen per call, and
Claude Haiku is a paid last link, off unless LLM_PAID_FALLBACK is true and
ANTHROPIC_API_KEY is set (docs/planning/2026-11-11-llm-fallback-chain-design.md).
The site runs free: by default the chain ends at the last Gemini model.

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
from datetime import UTC, datetime, time, timedelta
from time import monotonic
from typing import Protocol
from zoneinfo import ZoneInfo

import httpx2

from config import Config

logger = logging.getLogger(__name__)

# Gemini caps the whole inline request -- prompt, schema, and image bytes -- at
# 20 MB. Base64 inflates by 4/3, so the guard measures the encoded size.
MAX_REQUEST_BYTES = 20 * 1024 * 1024

# Vision extraction over several photographs is slow; this is not a chat.
TIMEOUT = 120.0

GEMINI_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"

# Every model in the chain, with the lowest thinking level it accepts. Not a
# preference list -- a survival list. Measured against the live API on
# 2026-11-11 (scripts/probe_llm_chain.py), not taken from the docs, which
# disagreed with it twice:
#
# - gemini-3.7-flash and gemini-3.5-flash are missing from the models page
#   but still served; 3.7 refuses MINIMAL with a 400, so it gets LOW.
# - gemini-2.5-flash and -lite are on the models page but answer 404 "no
#   longer available to new users", so they are out.
#
# Thinking defaults to medium on the Flash models; the lowest level is the
# documented way to cut latency (3.5 Flash answered in 0.8s at MINIMAL against
# 2.2s at its default).
#
# The free-tier quota is per project *per model*, so falling through also
# multiplies the daily budget rather than merely dodging an outage.
# gemini-flash-latest and gemini-flash-lite-latest are deliberately absent:
# each aliases a listed model and shares its quota, so it would be a second
# name for the same exhausted bucket.
THINKING_LEVELS = {
    "gemini-3.8-flash": "LOW",
    "gemini-3.7-flash": "LOW",
    "gemini-3.6-flash": "MINIMAL",
    "gemini-3.5-flash": "MINIMAL",
    "gemini-3.5-flash-lite": "MINIMAL",
    "gemini-3.1-flash-lite": "MINIMAL",
}

# Two orders over the same models, so either can fall all the way through.
#
# Text-only calls (Discover, closet opinion and Today, spot scoring) rank
# against a schema; the Flash-Lite models answered those in 0.6s while 3.8 and
# 3.7 hung for a minute and 3.6 answered 503, so they lead.
#
# Calls with images (photo import, closet tagging, intake) lead with the full
# Flash models, because reading titles off a photograph is where model quality
# shows. 3.6 and 3.5 come first: both were measured healthy on real photo
# imports, while 3.7 -- and 3.8 after it -- are the most contended.
TEXT_ORDER = (
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
)
VISION_ORDER = (
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
)
# Every chain model, by name. The intake budget counts quota across these.
GEMINI_MODELS = TEXT_ORDER

# Haiku 5.5: $0.10 / $0.50 per 1M tokens up to 100K-token prompts, images and
# structured outputs supported. Haiku 4.5 was ten times the price and legacy.
DEFAULT_ANTHROPIC_MODEL = "claude-haiku-5-5"
MAX_TOKENS = 8000

# Overload, not rate limiting. The Flash models return 503 while listed and
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
# The last model in the chain (and so a pinned model, which is a chain of one)
# gets one retry after a short wait, because it has nothing to fall through
# to -- unless the paid link follows it, in which case it gets none.
OVERLOAD_STATUSES = frozenset({500, 502, 503, 504})
OVERLOAD_RETRIES = 1
RETRY_DELAY_SECONDS = 2.0

# A model the API has withdrawn answers 404 (the 2.5 models did). That says
# nothing about the next model, so the chain moves on.
NOT_FOUND_STATUS = 404

# 429 is deliberately NOT retried, and the reason is the daily cap below: a
# quota measured per day does not refill within the seconds a retry would
# wait, so retrying spends the next request to be told the same thing and
# delays the honest answer to whoever is waiting.
RATE_LIMIT_STATUS = 429

# A ceiling on the whole call, not on one attempt.
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
# than fixed. The last model may use whatever is left. (The divisor is capped
# at SHARE_SPREAD, below.)
#
# Enforced through the request timeout and checked between attempts, never by
# cancelling a request mid-flight: that throws away work already paid for.
TOTAL_BUDGET_SECONDS = 150.0

# With the paid link behind it, Gemini gets the budget less this, and Haiku
# gets whatever is left -- at least this much. The whole call stays inside
# TOTAL_BUDGET_SECONDS plus Haiku's own answer, well inside the slowest
# caller's wrapper (closet opinion's OPINION_BUDGET_S, 240s).
ANTHROPIC_RESERVE_SECONDS = 60.0

# A share divides what is left by at most this many models, not by every
# model still to try. Six models dividing the budget evenly gave the first
# vision model 15s, too little for a real photo read, so every model would
# time out and the paid link would answer routine imports. Three keeps the
# share main had with its three models (50s, or 30s ahead of the paid link)
# while a hanging model still gives up its turn; later models get less if
# earlier ones hang, never less than MIN_ATTEMPT_SECONDS in practice.
SHARE_SPREAD = 3

# The shortest request worth sending. A share with less than this left is
# treated as spent: a few seconds is not long enough for a vision request to
# answer, so sending one would only use up a daily request for nothing.
MIN_ATTEMPT_SECONDS = 5.0

# Measured against the live API for the 3.x Flash models, because Google does
# not publish it: the free tier allows twenty generate_content requests per
# day, per project, per model (quota id
# GenerateRequestsPerDayPerProjectPerModel-FreeTier). Not per minute. Assumed,
# not yet measured, for the Flash-Lite models: the 2026-11-11 probe met no
# 429 to read a quotaValue from.
FREE_TIER_DAILY_REQUESTS = 20

# Gemini's free tier resets its per-day quota at midnight Pacific.
PACIFIC = ZoneInfo("America/Los_Angeles")


def next_pacific_midnight(now: datetime) -> datetime:
    """The next midnight in Los Angeles after ``now``, in UTC."""
    tomorrow = now.astimezone(PACIFIC).date() + timedelta(days=1)
    return datetime.combine(tomorrow, time(0), tzinfo=PACIFIC).astimezone(UTC)


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


class ModelUnavailable(LLMError):
    """Gemini could not answer for reasons the paid link may not share.

    Quota, overload, a timeout, a spent budget, a withdrawn model or an
    unreachable host. A bad request or a refused key is a plain LLMError: it
    would fail the same way on Haiku, so it is never handed off.
    """


# --- exhaustion memory ------------------------------------------------------
#
# A per-day 429 marks a model exhausted until the next midnight Pacific, so
# later calls skip it instead of spending a request to be told again. Held in
# process: the Render instance losing it on spin-down costs one wasted request
# per model, which is what every call cost before this existed. The intake
# budget's llm_usage rows are a separate, persisted count and are not read
# here (one database round trip per model call is not worth one request).

_exhausted_until: dict[str, datetime] = {}


def _utcnow() -> datetime:
    """The wall clock, a seam for tests (the budget uses monotonic)."""
    return datetime.now(UTC)


def mark_exhausted(model: str) -> None:
    """Skip ``model`` until its quota resets at the next midnight Pacific."""
    _exhausted_until[model] = next_pacific_midnight(_utcnow())


def is_exhausted(model: str) -> bool:
    """Whether ``model`` returned a per-day 429 since the last reset."""
    until = _exhausted_until.get(model)
    if until is None:
        return False
    if _utcnow() >= until:
        del _exhausted_until[model]
        return False
    return True


def reset_exhaustion() -> None:
    """Forget every exhausted model (tests, and nothing else)."""
    _exhausted_until.clear()


# --- the one log line per call ----------------------------------------------


class CallTrace:
    """What one complete_json call did, logged as a single line at the end.

    The per-attempt lines are DEBUG; this is the line to read in Render's log:
    which model answered, which were skipped or failed and why, and how long
    the whole call took.
    """

    def __init__(self, images: int) -> None:
        self.images = images
        self.started = monotonic()
        self.events: list[str] = []
        # The model that answered, set by the provider that got the answer.
        self.answered_by: str | None = None

    def elapsed(self) -> float:
        """Seconds since the call started."""
        return monotonic() - self.started

    def note(self, model: str, reason: str) -> None:
        """Record a model that was skipped or failed, and why."""
        self.events.append(f"{model}({reason})")

    def _skipped(self) -> str:
        return ", ".join(self.events) or "none"

    def log_answer(self, model: str) -> None:
        """Log the call as answered by ``model``."""
        logger.info(
            "llm answered by %s in %.1fs (images=%d); skipped: %s",
            model,
            self.elapsed(),
            self.images,
            self._skipped(),
        )

    def log_failure(self) -> None:
        """Log the call as failed."""
        logger.info(
            "llm failed in %.1fs (images=%d); skipped: %s",
            self.elapsed(),
            self.images,
            self._skipped(),
        )


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


def _mentions_thinking(body: dict | None) -> bool:
    """Whether a 400 body says the thinking level was the problem."""
    message = str(((body or {}).get("error") or {}).get("message") or "")
    return "thinking" in message.lower()


def _per_day_message(tried: int) -> str:
    """Every model used up for today. Keeps the words _failure_note reads."""
    models = "every model tried" if tried > 1 else "this model"
    return (
        f"Gemini's free tier allows {FREE_TIER_DAILY_REQUESTS} requests per "
        f"day per model, and {models} is used up. It resets at midnight "
        "Pacific."
    )


def _quota_message(body: dict | None, tried: int = 1) -> str:
    """A 429 explained in terms of which limit was actually hit.

    "Try again shortly" is true of a per-minute limit and a lie about a
    per-day one. Google reports the difference in a QuotaFailure detail, so
    the distinction is available rather than guessable -- and getting it wrong
    sends someone retrying for hours against a quota that resets at midnight.
    """
    quota_id = _quota_id(body)
    if "PerDay" in quota_id:
        return _per_day_message(tried)
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

    Walks TEXT_ORDER or VISION_ORDER. A per-day 429 marks the model used up
    until midnight Pacific and the walk moves on; only when every model has
    failed does the caller see an error (a ModelUnavailable that
    ChainedProvider hands to Haiku, or the reason, worded for the UI).
    """

    def __init__(self, api_key: str, model: str | None = None, recorder=None) -> None:
        self._api_key = api_key
        # intake.budget.UsageRecorder, or None: counts each attempt and marks
        # a model exhausted on a per-day 429 (intake spec D3).
        self._recorder = recorder
        # A named model pins the request to it; the default falls through the
        # chain, which is what makes an overloaded or exhausted model
        # survivable rather than fatal.
        self._pinned = model

    def _order(self, images: list[Image]) -> tuple[str, ...]:
        if self._pinned:
            return (self._pinned,)
        return VISION_ORDER if images else TEXT_ORDER

    def _build_body(
        self,
        prompt: str,
        schema: dict,
        images: list[Image],
        thinking_level: str | None = None,
    ) -> dict:
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
        generation_config: dict = {
            "responseMimeType": "application/json",
            "responseSchema": to_gemini_schema(schema),
        }
        if thinking_level is not None:
            generation_config["thinkingConfig"] = {"thinkingLevel": thinking_level}
        return {"contents": [{"parts": parts}], "generationConfig": generation_config}

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
        self,
        prompt: str,
        schema: dict,
        images: list[Image] | None = None,
        *,
        budget_seconds: float | None = None,
        final: bool = True,
        trace: CallTrace | None = None,
    ) -> dict:
        """JSON for ``schema`` from the first chain model that answers.

        ``budget_seconds`` caps the walk (TOTAL_BUDGET_SECONDS by default).
        ``final`` is False when a paid link follows, so the last Gemini model
        does not wait to retry. A ``trace`` passed in is the caller's to log.
        """
        images = images or []
        guard_payload_size(images)
        budget = TOTAL_BUDGET_SECONDS if budget_seconds is None else budget_seconds
        own_trace = trace is None
        trace = trace or CallTrace(len(images))
        try:
            model, result = await self._walk(
                prompt, schema, images, budget, final, trace
            )
        except LLMError:
            if own_trace:
                trace.log_failure()
            raise
        trace.answered_by = model
        if own_trace:
            trace.log_answer(model)
        return result

    async def _walk(
        self,
        prompt: str,
        schema: dict,
        images: list[Image],
        budget: float,
        final: bool,
        trace: CallTrace,
    ) -> tuple[str, dict]:
        order = self._order(images)
        models = []
        for model in order:
            if is_exhausted(model):
                trace.note(model, "used up")
            else:
                models.append(model)
        if not models:
            raise ModelUnavailable(_per_day_message(len(order)))

        last_status: int | None = None
        last_body: dict | None = None
        timed_out = False
        # Models that were actually sent a request -- the N in "across N
        # models". Claiming three were tried when the budget went during the
        # first is a small lie that would send someone looking in the wrong
        # place.
        tried = 0
        budget_ran_out = False
        # The last model's connection failed (no response at all).
        unreachable: httpx2.HTTPError | None = None

        def gave_up(elapsed: float) -> LLMError:
            return ModelUnavailable(
                f"Gave up after {elapsed:.0f}s across {tried} "
                f"model{'s' if tried != 1 else ''} — try again with fewer "
                "photos"
            )

        for index, model in enumerate(models):
            now = trace.elapsed()
            if now > budget:
                raise gave_up(now)

            # This model's share of what is left (see TOTAL_BUDGET_SECONDS).
            # For the last model that is all of it.
            models_left = len(models) - index
            share_ends = now + (budget - now) / min(models_left, SHARE_SPREAD)
            # Only the last model, with nothing behind it, waits out an
            # overload (see OVERLOAD_STATUSES), and then only once.
            retries = OVERLOAD_RETRIES if models_left == 1 and final else 0
            thinking_level = THINKING_LEVELS.get(model)
            retried = 0
            first = True
            budget_ran_out = False

            while True:
                # Never longer than this model's share has left, which is
                # never longer than the whole budget has left: a hanging
                # request would otherwise take the next model's turn.
                allowed = min(TIMEOUT, share_ends - (now if first else trace.elapsed()))
                if allowed < MIN_ATTEMPT_SECONDS:
                    budget_ran_out = True
                    trace.note(model, "no time")
                    break
                if first:
                    tried += 1
                    first = False
                body = self._build_body(prompt, schema, images, thinking_level)
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
                    logger.debug("gemini %s timed out: %s", model, error)
                    last_status, last_body, timed_out = 504, None, True
                    unreachable = None
                    if retried < retries:
                        await asyncio.sleep(RETRY_DELAY_SECONDS)
                        retried += 1
                        continue
                    trace.note(model, "timeout")
                    break
                except httpx2.HTTPError as error:
                    # A dropped connection is one request's bad luck, not
                    # Gemini's: the next free model is worth it before the
                    # paid one.
                    logger.debug("gemini %s unreachable: %s", model, error)
                    last_status, last_body, timed_out = None, None, False
                    unreachable = error
                    trace.note(model, "unreachable")
                    break

                logger.debug(
                    "gemini %s -> %s (%d images)",
                    model,
                    response.status_code,
                    len(images),
                )

                timed_out = False
                unreachable = None
                if response.status_code < 400:
                    try:
                        payload = response.json()
                    except ValueError as error:
                        # Not an LLMError otherwise, so Discover's template
                        # fallback would not run and the route would 500.
                        raise LLMError(
                            f"Gemini returned a body that is not JSON: {error}"
                        ) from error
                    return model, self._parse(payload)

                last_status = response.status_code
                try:
                    last_body = response.json()
                except ValueError:
                    last_body = None

                if (
                    response.status_code == 400
                    and thinking_level is not None
                    and _mentions_thinking(last_body)
                ):
                    # A chain entry with a level the model refuses. Worth one
                    # more request to answer this call, and worth a WARNING so
                    # the entry gets fixed rather than paid for every time.
                    logger.warning(
                        "gemini %s refused thinking level %s; retrying without it",
                        model,
                        thinking_level,
                    )
                    thinking_level = None
                    continue

                if response.status_code == RATE_LIMIT_STATUS and _is_per_day(last_body):
                    mark_exhausted(model)
                    if self._recorder is not None:
                        await self._recorder.exhausted(model)
                    trace.note(model, "used up")
                    break

                if response.status_code in OVERLOAD_STATUSES and retried < retries:
                    await asyncio.sleep(RETRY_DELAY_SECONDS)
                    retried += 1
                    continue
                trace.note(model, str(response.status_code))
                break

            # Overload, an exhausted quota and a withdrawn model are all
            # properties of one model, not of Gemini, so each is worth trying
            # the next one for. So is a spent share: it says nothing about
            # the next model. Anything else -- a malformed request, a bad key
            # -- would fail identically everywhere and is not worth the calls.
            if (
                last_status in OVERLOAD_STATUSES
                or last_status in (RATE_LIMIT_STATUS, NOT_FOUND_STATUS)
                or budget_ran_out
                or unreachable is not None
            ):
                continue
            break

        if budget_ran_out and last_status != RATE_LIMIT_STATUS:
            # Time, not the models, is what ran out.
            raise gave_up(trace.elapsed())
        if last_status == RATE_LIMIT_STATUS:
            raise ModelUnavailable(_quota_message(last_body, tried=len(order)))
        if timed_out:
            # No response came back, so no HTTP status to report.
            raise ModelUnavailable(
                f"Gemini did not answer in time — tried {', '.join(models)}. "
                "Try again in a few minutes."
            )
        if last_status in OVERLOAD_STATUSES:
            raise ModelUnavailable(
                f"Gemini is overloaded (HTTP {last_status}) — tried "
                f"{', '.join(models)} and none recovered. Try again in a "
                "few minutes."
            )
        if last_status == NOT_FOUND_STATUS:
            raise ModelUnavailable(
                f"Gemini no longer serves {', '.join(models)} (HTTP 404)"
            )
        if unreachable is not None:
            raise ModelUnavailable(f"Gemini request failed: {unreachable}")
        raise LLMError(f"Gemini returned HTTP {last_status}")


class AnthropicProvider:
    """Anthropic via the official SDK.

    The SDK is imported lazily so a Gemini-only deploy never loads it.
    """

    def __init__(self, api_key: str, model: str = DEFAULT_ANTHROPIC_MODEL) -> None:
        self._api_key = api_key
        self.model = model

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
        self,
        prompt: str,
        schema: dict,
        images: list[Image] | None = None,
        *,
        timeout: float = TIMEOUT,
        trace: CallTrace | None = None,
    ) -> dict:
        """JSON for ``schema`` from Claude. A ``trace`` passed in is the
        caller's to log."""
        import anthropic

        images = images or []
        guard_payload_size(images)
        own_trace = trace is None
        trace = trace or CallTrace(len(images))

        # A client per call, closed with it: an unclosed one leaks its pool.
        try:
            # No SDK retries: its default of two would triple both the time
            # (past closet opinion's 240s wrapper) and the bill. The Gemini
            # chain ahead of it is the retry.
            async with anthropic.AsyncAnthropic(
                api_key=self._api_key, timeout=timeout, max_retries=0
            ) as client:
                try:
                    response = await client.messages.create(
                        model=self.model,
                        max_tokens=MAX_TOKENS,
                        messages=[
                            {
                                "role": "user",
                                "content": self._build_content(prompt, images),
                            }
                        ],
                        output_config={
                            "format": {"type": "json_schema", "schema": schema}
                        },
                    )
                except anthropic.APIError as error:
                    trace.note(self.model, "failed")
                    raise LLMError(f"Anthropic request failed: {error}") from error

            logger.debug(
                "anthropic %s -> %s (%d images)",
                self.model,
                response.stop_reason,
                len(images),
            )
            text = next((b.text for b in response.content if b.type == "text"), "")
            result = self._parse(text)
        except LLMError:
            if own_trace:
                trace.log_failure()
            raise
        if own_trace:
            trace.log_answer(self.model)
        return result


class ChainedProvider:
    """The free Gemini chain, then Claude Haiku when Gemini cannot answer.

    Haiku is reached only on a ModelUnavailable -- every model used up,
    overloaded, timed out, withdrawn or unreachable, or Gemini's share of the
    budget spent. A bad request or a refused key is raised as it is: it would
    fail on Haiku too, and costs money there.
    """

    def __init__(self, gemini: GeminiProvider, anthropic: AnthropicProvider) -> None:
        self._gemini = gemini
        self._anthropic = anthropic

    async def complete_json(
        self, prompt: str, schema: dict, images: list[Image] | None = None
    ) -> dict:
        """JSON for ``schema``, free if possible, paid if not."""
        trace = CallTrace(len(images or []))
        try:
            result = await self._gemini.complete_json(
                prompt,
                schema,
                images,
                budget_seconds=TOTAL_BUDGET_SECONDS - ANTHROPIC_RESERVE_SECONDS,
                final=False,
                trace=trace,
            )
        except ModelUnavailable as unavailable:
            gemini_error = unavailable
        except LLMError:
            trace.log_failure()
            raise
        else:
            trace.log_answer(trace.answered_by or "gemini")
            return result

        logger.debug("llm handing off to %s: %s", self._anthropic.model, gemini_error)
        timeout = max(TOTAL_BUDGET_SECONDS - trace.elapsed(), ANTHROPIC_RESERVE_SECONDS)
        try:
            result = await self._anthropic.complete_json(
                prompt, schema, images, timeout=timeout, trace=trace
            )
        except LLMError as error:
            trace.log_failure()
            # The paid link's own words, which _failure_note reads ("Error
            # code: 429", "request failed"); the prefix matches none of its
            # patterns, so it cannot change the wording.
            raise LLMError(f"Gemini unavailable, then {error}") from error
        trace.log_answer(self._anthropic.model)
        return result


def build_free_provider(config: Config, recorder=None) -> GeminiProvider:
    """The free Gemini chain alone, whatever LLM_PROVIDER and
    LLM_PAID_FALLBACK say: for a nightly job that must never bill."""
    if not config.gemini_api_key:
        raise LLMError("GEMINI_API_KEY is not set")
    return GeminiProvider(config.gemini_api_key, recorder=recorder)


def build_provider(config: Config, recorder=None) -> LLMProvider:
    """The provider LLM_PROVIDER names, or an error naming what is missing.

    gemini is the free chain alone, unless LLM_PAID_FALLBACK is true and
    ANTHROPIC_API_KEY is set: then Haiku is the paid last link. A key alone
    never adds it, so nothing is billed by accident. anthropic is Anthropic
    only.

    Built per request rather than at import, so an absent key is a failure of
    the one route that needs a model rather than a service that will not boot.
    """
    provider = (config.llm_provider or "gemini").lower()
    if provider == "gemini":
        if not config.gemini_api_key:
            raise LLMError("LLM_PROVIDER is gemini but GEMINI_API_KEY is not set")
        gemini = GeminiProvider(config.gemini_api_key, recorder=recorder)
        if config.llm_paid_fallback and config.anthropic_api_key:
            return ChainedProvider(gemini, AnthropicProvider(config.anthropic_api_key))
        return gemini
    if provider == "anthropic":
        if not config.anthropic_api_key:
            raise LLMError("LLM_PROVIDER is anthropic but ANTHROPIC_API_KEY is not set")
        return AnthropicProvider(config.anthropic_api_key)
    raise LLMError(f"unknown LLM_PROVIDER {provider!r}: expected gemini or anthropic")
