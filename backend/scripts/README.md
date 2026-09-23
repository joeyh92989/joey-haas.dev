# backend/scripts

One-off tools run by hand. Nothing here is imported by the app.

## record_igdb_fixtures.py

Records live IGDB responses into `tests/fixtures/` so the E7b snapshot parser
is tested against what the API actually returns.

**Why:** the IGDB docs, third-party code and this codebase's own assumptions
disagreed on the fields the snapshot now reads: `game_status` replaced the
deprecated `status`; time to beat is a separate endpoint in seconds; the
Nintendo 64 and Switch 2 platform ids are not in the official docs. A
fixture settles each one.

**Run** from `backend/`. With no arguments it searches IGDB for one
well-known game per platform the snapshot has to handle: Mario Kart World
(Switch 2), Breath of the Wild (Switch), Super Mario 64 (N64). The fixtures
pin the shape of IGDB's answers, and that doesn't depend on whose games they
are. IGDB game ids can be given instead.

```bash
./.venv/bin/python scripts/record_igdb_fixtures.py
```

**Needs** `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` in `backend/.env`. It
loads config exactly as the API does, so every other required variable must
be set too. It makes 7 requests, spaced to stay within IGDB's 4-per-second limit.

**Writes**, response bodies only. No token, client id or secret is written or
printed:

| File | Contents |
|---|---|
| `tests/fixtures/igdb_games_e7b.json` | `/v4/games` for the ids, with the E7b field list |
| `tests/fixtures/igdb_time_to_beats.json` | `/v4/game_time_to_beats` for those ids plus ten unrated games, with the requested ids alongside, so a missing game can be told from one never asked about |
| `tests/fixtures/igdb_platforms.json` | `/v4/platforms` for `n64`, `switch-2`, `switch` |

It prints a summary: rows per file, how many unrated games had no time to
beat, and the platform ids. Commit the three files. They are test data, and
contain nothing private.

**Limits:** the unrated games are whatever IGDB returns first, so a rerun may
record different ones. The field list is duplicated from `sources/igdb.py`
`FIELDS` and has to change with it.
