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
DEFAULT_GEMINI_MODEL = "gemini-3.7-flash"
DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5"
MAX_TOKENS = 8000

# Observed in practice, not theory: a first call to gemini-3.7-flash returned
# 503 twice while the model was listed and available. Overload is transient and
# common enough on the free tier that one retry is the difference between a
# working import and a mystifying failure.
RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})
RETRY_DELAY_SECONDS = 2.0


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

    def __init__(self, api_key: str, model: str = DEFAULT_GEMINI_MODEL) -> None:
        self._api_key = api_key
        self._model = model

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
                "responseSchema": schema,
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
        for attempt in (1, 2):
            try:
                async with httpx2.AsyncClient(timeout=TIMEOUT) as client:
                    response = await client.post(
                        f"{GEMINI_ROOT}/{self._model}:generateContent",
                        json=body,
                        headers={"x-goog-api-key": self._api_key},
                    )
            except httpx2.HTTPError as error:
                raise LLMError(f"Gemini request failed: {error}") from error

            logger.info(
                "gemini %s attempt %d -> %s (%d images)",
                self._model,
                attempt,
                response.status_code,
                len(images),
            )

            if response.status_code < 400:
                return self._parse(response.json())

            last_status = response.status_code
            if attempt == 1 and response.status_code in RETRY_STATUSES:
                await asyncio.sleep(RETRY_DELAY_SECONDS)
                continue
            break

        if last_status == 429:
            raise LLMError("Gemini rate limit reached — try again shortly")
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
