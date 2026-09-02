"""A single seam over the two LLM providers.

One method, deliberately. This is a seam, not a framework: the application
needs JSON conforming to a schema, optionally derived from images, and nothing
else. Both providers enforce the schema server-side -- Gemini through
responseSchema, Anthropic through output_config.format -- so neither returns
prose that has to be salvaged with a regex.

Images are passed inline as base64 and never written to disk. Render's free
tier has an ephemeral disk, so anything written there is lost on restart while
still being a data-retention surface, and the photographs have no value once
the titles have been read off them.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
from dataclasses import dataclass
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
# real import failed on one photo this way. Backing off across several attempts
# is what turns that into a slow success instead of a mystifying failure.
OVERLOAD_STATUSES = frozenset({500, 502, 503, 504})
RETRY_DELAYS_SECONDS = (2.0, 5.0, 10.0)

# 429 is deliberately NOT retried, and the reason is the daily cap below: a
# quota measured per day does not refill within the seconds a retry would
# wait, so retrying spends the next request to be told the same thing and
# delays the honest answer to whoever is waiting.
RATE_LIMIT_STATUS = 429

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


def _quota_message(body: dict | None, tried: int = 1) -> str:
    """A 429 explained in terms of which limit was actually hit.

    "Try again shortly" is true of a per-minute limit and a lie about a
    per-day one. Google reports the difference in a QuotaFailure detail, so
    the distinction is available rather than guessable -- and getting it wrong
    sends someone retrying for hours against a quota that resets at midnight.
    """
    quota_id = ""
    for detail in ((body or {}).get("error") or {}).get("details") or []:
        for violation in detail.get("violations") or []:
            quota_id = violation.get("quotaId") or quota_id

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

    def __init__(self, api_key: str, model: str | None = None) -> None:
        self._api_key = api_key
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

        for model in self._models:
            # One attempt more than there are delays: the final attempt is not
            # followed by a wait.
            for attempt in range(len(RETRY_DELAYS_SECONDS) + 1):
                try:
                    async with httpx2.AsyncClient(timeout=TIMEOUT) as client:
                        response = await client.post(
                            f"{GEMINI_ROOT}/{model}:generateContent",
                            json=body,
                            headers={"x-goog-api-key": self._api_key},
                        )
                except httpx2.HTTPError as error:
                    raise LLMError(f"Gemini request failed: {error}") from error

                logger.info(
                    "gemini %s attempt %d -> %s (%d images)",
                    model,
                    attempt + 1,
                    response.status_code,
                    len(images),
                )

                if response.status_code < 400:
                    return self._parse(response.json())

                last_status = response.status_code
                try:
                    last_body = response.json()
                except ValueError:
                    last_body = None

                retryable = response.status_code in OVERLOAD_STATUSES
                if retryable and attempt < len(RETRY_DELAYS_SECONDS):
                    await asyncio.sleep(RETRY_DELAYS_SECONDS[attempt])
                    continue
                break

            # Overload and an exhausted quota are both properties of one
            # model, not of Gemini, so both are worth trying the next one for.
            # Anything else -- a malformed request, a bad key -- would fail
            # identically everywhere and is not worth the extra calls.
            if last_status in OVERLOAD_STATUSES or last_status == RATE_LIMIT_STATUS:
                logger.info("gemini falling through from %s (%s)", model, last_status)
                continue
            break

        if last_status == RATE_LIMIT_STATUS:
            raise LLMError(_quota_message(last_body, tried=len(self._models)))
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

        client = anthropic.AsyncAnthropic(api_key=self._api_key, timeout=TIMEOUT)
        try:
            response = await client.messages.create(
                model=self._model,
                max_tokens=MAX_TOKENS,
                messages=[
                    {"role": "user", "content": self._build_content(prompt, images)}
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


def build_provider(config: Config) -> LLMProvider:
    """The provider named by LLM_PROVIDER, or an error naming what is missing.

    Built per request rather than at import, so an absent key is a failure of
    the one route that needs a model rather than a service that will not boot.
    """
    provider = (config.llm_provider or "gemini").lower()
    if provider == "gemini":
        if not config.gemini_api_key:
            raise LLMError("LLM_PROVIDER is gemini but GEMINI_API_KEY is not set")
        return GeminiProvider(config.gemini_api_key)
    if provider == "anthropic":
        if not config.anthropic_api_key:
            raise LLMError("LLM_PROVIDER is anthropic but ANTHROPIC_API_KEY is not set")
        return AnthropicProvider(config.anthropic_api_key)
    raise LLMError(f"unknown LLM_PROVIDER {provider!r}: expected gemini or anthropic")
