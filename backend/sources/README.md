# `sources/` — metadata adapters

One module per external catalogue, behind a common interface.

## What this is and why

The tracker needs the same two things from every catalogue: find candidates for
a title, then fetch the details of one. The catalogues themselves have almost
nothing in common — JSON and XML, four different authentication schemes, wildly
different throttles, and one that is not open at all. Everything specific to a
source stays behind `SourceAdapter`, so the metadata picker
(`items.py`), the photo importer (`importer.py`), and the bulk enrichment step
never learn which API they are talking to.

That boundary is what makes the rest testable. Resolution is a pure function of
a title and a list of candidates, so `matching.py` and the importer are covered
without a single network call or model call.

## The interface

```python
class SourceAdapter(Protocol):
    source_name: str  # "tmdb", stored in Item.external_source
    item_type: ItemType  # which media type this source answers for

    def configured(self) -> bool: ...
    async def search(
        self, query: str, year: int | None = None
    ) -> list[SourceResult]: ...
    async def fetch(self, external_id: str) -> SourceDetail: ...
```

`SourceResult` is one picker row: `external_id`, `title`, `year`,
`thumbnail_url`. `SourceDetail` is the full record, mapped onto the columns
`Item` actually has plus a `source_metadata` snapshot.

Errors are typed (`sources/base.py`):

| Exception | Means | Becomes |
|---|---|---|
| `SourceNotConfigured` | No credentials on this deploy | 503 on the picker; `unresolved` in an import |
| `SourceRateLimited` | Refused for rate reasons, after retries | 429 |
| `SourceError` | Anything else | 502 |

`SourceNotConfigured` is deliberately not a failure. It means the feature was
never enabled here, so the right response is to disable that media type — not
to retry, and not to alert.

## Configuration is checked lazily, never at boot

`config.py` fails fast on the values the service cannot run without. Source
keys are **not** among them, and must not be added to `_REQUIRED`. Running
without a `SESSION_SECRET` is unsafe; running without a ComicVine key just
means comic lookups are unavailable. Requiring them would mean a deploy of the
film feature could not boot without a board-game registration.

The cost is that a mistyped key surfaces at first use rather than at boot.
`main.py` logs the configured sources at startup to close that gap:

```
INFO:main:metadata sources configured: comicvine, igdb, tmdb
```

If a source you expect is missing from that line, its variable is wrong.

## Throttling is per source

Each adapter owns a `Throttle`. A single global limiter set to the slowest
source's pace would make a shelf of films resolve at board-game speed. The
importer groups detections by source and runs the groups concurrently, serially
within each group, so a mixed batch is only as slow as its slowest rows — and
only those rows.

## The sources

| Source | Type | Auth | Throttle | Status |
|---|---|---|---|---|
| TMDB | `movie` | v4 Bearer token | 20 req/s | Working |
| IGDB | `game` | Twitch client-credentials token, cached | 4 req/s | Working |
| ComicVine | `comic` | `api_key` query param | ~1 req/s | Working |
| BGG | `boardgame` | Registered app + token | — | **Blocked** |

### TMDB — `TMDB_API_TOKEN`

themoviedb.org → Settings → API → request a developer key. Free for
non-commercial use. Both the v3 `api_key` parameter and the v4 token grant
identical access; the token is used because it works across both API versions.

Rate ceiling is around 40 requests/second and TMDB says it may change, so 429
is handled rather than designed around.

**Attribution is required** wherever this data is shown: "This product uses the
TMDB API but is not endorsed or certified by TMDB", plus a link to
themoviedb.org. It is on the collection page.

### IGDB — `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`

A Twitch account with 2FA → dev.twitch.tv/console → register an application.

`api-docs.igdb.com` was unreachable (403) when this was written, so everything
here was confirmed against the live API instead:

- The client-credentials grant returns a `bearer` token with `expires_in` of
  about 65 days. It is cached on the adapter and refreshed on a 401.
- Queries are Apicalypse bodies POSTed to `/v4/games`.
- No rate-limit headers come back, so the documented 4 req/s is unverified.
- **`first_release_date` is a Unix timestamp, not a date string.** The shared
  `year_from_date` helper reads `1559001600` as the year 1559 — plausible
  enough to survive review, and it would then filter the candidate list in
  `matching.py` and hide the right game. `year_from_unix` exists for this.

`creator` is the developer, not the publisher.

No attribution required; credited anyway.

### ComicVine — `COMICVINE_API_KEY`

comicvine.gamespot.com/api → free account → key. Tracked at the **volume**
(series) level: a shelf is organised by series, so the row is "Saga", not
"Saga #17".

Two things their documentation does not tell you, both confirmed live:

- **A custom `User-Agent` is required.** With a default HTTP client agent
  ComicVine answers `403 Anonymous Bot or Scraper Blocked`.
- **Errors arrive inside a 200 body.** A status check alone reads
  `{"error": "Invalid API Key"}` as an empty result set.

Their docs state no rate limits at all — the 200-per-hour figure repeated
elsewhere is not theirs — so this throttles at ~1 req/s and never fans out.
`/search` cannot exceed `limit=10`, which their docs do say.

ComicVine exposes no community rating, so `source_metadata` has no
`community_score` key rather than a null one implying the field exists.

Strictly non-commercial; a personal portfolio qualifies. **A link back to Comic
Vine is required** where its data is shown.

### BGG — blocked

BGG's XML API is no longer open. Verified 2026-09-01: `xmlapi2` and the older
`xmlapi` both return

```
401 Unauthorized. See https://boardgamegeek.com/using_the_xml_api
```

for every request, under a custom User-Agent, a browser User-Agent, and none at
all. BGG began requiring registered applications and authorization tokens in
late 2025.

`bgg.py` therefore implements only the configuration check. Search and detail
parsing are deliberately **not** written against the documented XML shape,
because nothing here could verify them — every other adapter is tested against
recorded real responses, and recording one needs a token. Guessing the mapping
would produce code that looks finished, passes fixtures it invented for itself,
and fails on first contact.

The behaviour until then is correct rather than merely absent: board games read
from a photograph import as manual rows carrying the title that was read, and
the picker reports the source as unavailable.

**To finish it:** register at the form linked from
`boardgamegeek.com/using_the_xml_api`, set `BGG_TOKEN`, record real `search`
and `thing` fixtures, then implement `_parse_search` and `_parse_detail` the way
`tmdb.py` does. `thing` accepts up to 20 comma-separated ids per request, and
HTTP 202 means "queued, retry". Note that "Powered by BGG" attribution is
required for public-facing use.

## Adding a source

1. Write `sources/<name>.py` with a class exposing `source_name`, `item_type`,
   `configured()`, `search()`, `fetch()`.
2. Keep parsing in pure `_parse_search` / `_parse_detail` methods. Only
   `search` and `fetch` touch the network — that is what lets the tests run
   against recorded responses rather than a mocked HTTP client, which would
   only assert that the mock was configured the way the test configured it.
3. Record real fixtures into `tests/fixtures/` once, by hand, and commit them.
4. Add the credential to `config.py` as an optional field. Do not touch
   `_REQUIRED`.
5. Add one line to `build_registry` in `registry.py`.
6. Add the attribution to the collection page if the source requires one.

Nothing else changes. The picker, the importer, and bulk enrichment pick it up
through the registry.
