"""Probe the Gemini models the fallback chain might use.

Answers, against the live API, the questions the docs leave open
(docs/planning/2026-11-11-llm-fallback-chain-plan.md): which models this key
can call, whether each accepts the thinking config planned for it alongside
a responseSchema, and what daily quota a 429 reports.

Costs one request from each model's free daily quota per candidate row, and
nothing for the model list. The key travels only in the request header and
is never printed.

Run from backend/:

    ./.venv/bin/python scripts/probe_llm_chain.py
"""

from __future__ import annotations

import asyncio
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from time import monotonic

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "scripts"))

GEMINI_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"
TIMEOUT = 60.0
PROMPT = 'Answer with the JSON object {"ok": "ok"}.'
SCHEMA = {
    "type": "object",
    "properties": {"ok": {"type": "string"}},
    "required": ["ok"],
}


@dataclass(frozen=True)
class Candidate:
    """One model with the thinking config to try it with (None: send none)."""

    model: str
    thinking: dict | None


# The planned config per model, then the 2.5 variants that settle D1: the
# docs say thinkingLevel errors before Gemini 3 and do not document
# thinkingBudget, so both are asked about. 3.7 and 3.5 Flash are probed only
# to learn whether they are still served.
CANDIDATES = (
    Candidate("gemini-3.8-flash", {"thinkingLevel": "LOW"}),
    Candidate("gemini-3.6-flash", {"thinkingLevel": "MINIMAL"}),
    Candidate("gemini-3.5-flash-lite", {"thinkingLevel": "MINIMAL"}),
    Candidate("gemini-3.1-flash-lite", {"thinkingLevel": "MINIMAL"}),
    Candidate("gemini-2.5-flash", None),
    Candidate("gemini-2.5-flash", {"thinkingBudget": 0}),
    Candidate("gemini-2.5-flash", {"thinkingLevel": "LOW"}),
    Candidate("gemini-2.5-flash-lite", None),
    Candidate("gemini-2.5-flash-lite", {"thinkingBudget": 0}),
    Candidate("gemini-2.5-flash-lite", {"thinkingLevel": "LOW"}),
    Candidate("gemini-3.7-flash", None),
    Candidate("gemini-3.5-flash", None),
)


@dataclass(frozen=True)
class Result:
    """What one probe request found. `status` is None when none was sent."""

    model: str
    thinking: dict | None
    status: int | None
    seconds: float = 0.0
    parsed: bool = False
    quota_id: str = ""
    quota_value: str = ""
    note: str = ""


async def list_models(client, api_key: str) -> set[str]:
    """Names of the models this key may call generateContent on."""
    response = await client.get(
        GEMINI_ROOT,
        headers={"x-goog-api-key": api_key},
        params={"pageSize": 1000},
    )
    if response.status_code >= 400:
        raise RuntimeError(f"models.list returned HTTP {response.status_code}")
    return {
        model["name"].split("/", 1)[-1]
        for model in response.json().get("models") or []
        if "generateContent" in (model.get("supportedGenerationMethods") or [])
    }


def build_body(thinking: dict | None) -> dict:
    """The probe request: a one-field schema, plus the thinking config."""
    config: dict = {"responseMimeType": "application/json", "responseSchema": SCHEMA}
    if thinking is not None:
        config["thinkingConfig"] = thinking
    return {"contents": [{"parts": [{"text": PROMPT}]}], "generationConfig": config}


def _quota(body: dict) -> tuple[str, str]:
    """quotaId and quotaValue from a 429's QuotaFailure, either may be ""."""
    quota_id = quota_value = ""
    for detail in (body.get("error") or {}).get("details") or []:
        for violation in detail.get("violations") or []:
            quota_id = violation.get("quotaId") or quota_id
            quota_value = str(violation.get("quotaValue") or quota_value)
    return quota_id, quota_value


def _parsed(body: dict) -> bool:
    candidates = body.get("candidates") or []
    if not candidates:
        return False
    parts = (candidates[0].get("content") or {}).get("parts") or []
    try:
        return isinstance(json.loads("".join(p.get("text", "") for p in parts)), dict)
    except json.JSONDecodeError:
        return False


async def probe_one(client, api_key: str, candidate: Candidate) -> Result:
    """Send one request to one model and describe the answer."""
    started = monotonic()
    try:
        response = await client.post(
            f"{GEMINI_ROOT}/{candidate.model}:generateContent",
            json=build_body(candidate.thinking),
            headers={"x-goog-api-key": api_key},
        )
    except Exception as error:  # noqa: BLE001 -- reported in the table
        return Result(
            candidate.model,
            candidate.thinking,
            status=None,
            seconds=monotonic() - started,
            note=type(error).__name__,
        )
    seconds = monotonic() - started
    try:
        body = response.json()
    except ValueError:
        body = {}
    quota_id, quota_value = _quota(body)
    message = str((body.get("error") or {}).get("message") or "")[:120]
    return Result(
        candidate.model,
        candidate.thinking,
        status=response.status_code,
        seconds=seconds,
        parsed=response.status_code < 400 and _parsed(body),
        quota_id=quota_id,
        quota_value=quota_value,
        note=message,
    )


async def run(client, api_key: str, candidates, served: set[str]) -> list[Result]:
    """Probe each candidate the API lists; skip the rest without a request."""
    results = []
    for candidate in candidates:
        if candidate.model not in served:
            results.append(
                Result(candidate.model, candidate.thinking, None, note="not listed")
            )
            continue
        results.append(await probe_one(client, api_key, candidate))
    return results


def format_table(results: list[Result]) -> str:
    """A plain-text table of the results, one row per probe."""
    rows = [("model", "thinking", "status", "secs", "json", "quota", "note")]
    for result in results:
        rows.append(
            (
                result.model,
                json.dumps(result.thinking) if result.thinking else "-",
                str(result.status) if result.status is not None else "-",
                f"{result.seconds:.1f}",
                "yes" if result.parsed else "no",
                f"{result.quota_id} {result.quota_value}".strip() or "-",
                result.note or "-",
            )
        )
    widths = [max(len(row[i]) for row in rows) for i in range(len(rows[0]) - 1)]
    return "\n".join(
        "  ".join(cell.ljust(width) for cell, width in zip(row, widths, strict=False))
        + "  "
        + row[-1]
        for row in rows
    )


def main() -> int:
    """Load config as the API does, probe every candidate, print the table."""
    from dotenv import load_dotenv
    from migrate_neon import main_checkout_env

    load_dotenv(main_checkout_env())
    import httpx2

    from config import load_config

    config = load_config()
    if not config.gemini_api_key:
        print("GEMINI_API_KEY is not set", file=sys.stderr)
        return 1

    async def _run() -> list[Result]:
        async with httpx2.AsyncClient(timeout=TIMEOUT) as client:
            served = await list_models(client, config.gemini_api_key)
            print(
                "served flash models:",
                ", ".join(sorted(m for m in served if "flash" in m)),
            )
            return await run(client, config.gemini_api_key, CANDIDATES, served)

    print(format_table(asyncio.run(_run())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
