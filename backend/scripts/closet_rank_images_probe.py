"""Measure the closet ranker with and without the shortlist's thumbnails.

Spike #400, the tooling half: decides whether `closet_settings["rank.images"]`
(issue #401, decision D9) can be turned on. Against a LOCAL database that has
garments with photos, it builds the same shortlist Today builds, then asks
each provider the same ranking question twice, text only and with the
thumbnails, and writes one JSON report: latency, request bytes (prompt text
and images, raw and as base64) and the outcome of each call.

Token usage is recorded as null: `LLMProvider.complete_json` returns only the
answer, not the provider's usage block, so there is nothing to record without
changing llm.py. Request bytes and latency are what this reports.

It calls the real providers (a free-quota Gemini chain, and Claude Haiku when
ANTHROPIC_API_KEY is set, which bills). It is never imported or run by the
tests; they use fakes against `measure()`.

Run from backend/ (the report defaults to ~/Developer/closet-seed/, outside
the repo, because it carries the owner's garment names):

    ./.venv/bin/python scripts/closet_rank_images_probe.py \
        --database-url postgresql+asyncpg://localhost/stats_dev \
        --out ~/Developer/closet-seed/rank-images-report.json
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import sys
from datetime import date
from pathlib import Path
from time import monotonic

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "scripts"))

DEFAULT_OUT = Path.home() / "Developer" / "closet-seed" / "rank-images-report.json"
LOCAL_HOSTS = ("localhost", "127.0.0.1", "::1")


def _bytes(prompt: str, images) -> dict[str, int]:
    raw = sum(len(image.data) for image in images)
    return {
        "prompt_bytes": len(prompt.encode()),
        "images": len(images),
        "image_bytes": raw,
        "image_bytes_base64": sum(
            len(base64.b64encode(image.data)) for image in images
        ),
    }


async def _call(provider, prompt: str, schema: dict, images) -> dict:
    """One timed call; an error is a result, not an exception."""
    started = monotonic()
    row = {**_bytes(prompt, images), "usage": None}
    try:
        answer = await provider.complete_json(prompt, schema, images=images or None)
    except Exception as error:  # a refused payload is a finding
        row.update(
            seconds=round(monotonic() - started, 2),
            ok=False,
            error=f"{type(error).__name__}: {error}"[:300],
        )
        return row
    row.update(
        seconds=round(monotonic() - started, 2),
        ok=True,
        outfits=len((answer or {}).get("outfits") or []),
    )
    return row


async def measure(session, providers: dict, day: date, occasion: str, bike: bool):
    """The report: for each provider, the plan's prompt without and with the
    shortlist's thumbnails. `providers` maps a name to an object with
    `complete_json(prompt, schema, images=None)`."""
    import closet
    import closet_rank
    import weather
    from closet_routes import load_profile, profile_out
    from closet_today_routes import load_pieces, shortlist_images

    profile = profile_out(await load_profile(session))
    pieces, _rows, _photos = await load_pieces(session, day)
    request = closet.Request(
        day=day,
        occasion=occasion,
        bike=bike,
        repeat_top_days=profile["repeat_top_days"],
        repeat_outfit_weeks=profile["repeat_outfit_weeks"],
    )
    read = closet.read_weather(await weather.hours_for_day(session, day), day)
    found = closet.candidates(pieces, request, read)
    sentence = closet.read_sentence(read, bike, f"{day:%B}")
    args = (found, request, read, sentence, profile, ())
    picks, images = await shortlist_images(session, found)
    text_prompt = closet_rank.build_prompt(*args)
    image_prompt = closet_rank.build_prompt(*args, images=picks)
    report = {
        "day": day.isoformat(),
        "occasion": occasion,
        "bike": bike,
        "candidates": len(closet_rank.numbered(found)),
        "garments_with_photos": len(_photos),
        "images_sent": len(images),
        "providers": {},
    }
    for name, provider in providers.items():
        report["providers"][name] = {
            "text_only": await _call(provider, text_prompt, closet_rank.SCHEMA, []),
            "with_images": await _call(
                provider, image_prompt, closet_rank.SCHEMA, images
            ),
        }
    return report


def _providers(config) -> dict:
    from llm import AnthropicProvider, GeminiProvider

    found = {}
    if config.gemini_api_key:
        found["gemini_chain"] = GeminiProvider(config.gemini_api_key)
    if config.anthropic_api_key:
        found["anthropic_haiku"] = AnthropicProvider(config.anthropic_api_key)
    return found


def _check_local(url: str, allow_remote: bool) -> None:
    host = url.split("@")[-1].split("/")[0].split(":")[0] if "@" in url else ""
    host = host or url.split("//")[-1].split("/")[0].split(":")[0]
    if not allow_remote and host not in LOCAL_HOSTS and host != "":
        raise SystemExit(
            f"{host} is not local; this probe reads a local database "
            "(--allow-remote to override)"
        )


async def run(args) -> Path:
    from dotenv import load_dotenv
    from migrate_neon import main_checkout_env
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from db import connect_args_for, normalize_async_url

    load_dotenv(main_checkout_env())
    from config import load_config

    config = load_config()
    providers = _providers(config)
    if not providers:
        raise SystemExit("no GEMINI_API_KEY or ANTHROPIC_API_KEY in backend/.env")
    url = normalize_async_url(args.database_url)
    engine = create_async_engine(url, connect_args=connect_args_for(url))
    try:
        async with async_sessionmaker(engine)() as session:
            report = await measure(
                session, providers, args.day, args.occasion, args.bike
            )
    finally:
        await engine.dispose()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=1) + "\n")
    return args.out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--database-url",
        default=os.environ.get("PROBE_DATABASE_URL"),
        help="local database with garments that have photos (or PROBE_DATABASE_URL)",
    )
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--day", type=date.fromisoformat, default=date.today())
    parser.add_argument("--occasion", default="office")
    parser.add_argument("--bike", action="store_true")
    parser.add_argument("--allow-remote", action="store_true")
    args = parser.parse_args(argv)
    if not args.database_url:
        parser.error("--database-url (or PROBE_DATABASE_URL) is required")
    _check_local(args.database_url, args.allow_remote)
    path = asyncio.run(run(args))
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
