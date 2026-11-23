---
status: planned
kind: refactor (removal)
mode: auto, at Joey's request
---

# Remove Denver (spots, finder, weekend planner): the code

Story #631 of epic #630. The site keeps the shelf and the Closet, plus Analytics and Jobs as infrastructure. Denver spots, the candidate finder and the weekend planner go. The model is the places-and-outings removal (`2026-11-20-remove-places-outings-design.md`, #537 code then #538 migration): this PR is the code only, in two PRs so the running code never names a column that is gone. **No migration and no drop here.** Story #632 drops the tables and needs Joey.

## Inventory

Backend (all removed unless marked):

- `spots.py`, `spots_routes.py`, `spots_candidates_routes.py`, `spots_weekend_routes.py`, `spots_schemas.py`, `spot_sources/` (Overpass client, dedupe, limits, README), `candidates.py` (the finder's scoring), `planner.py` (the weekend planner), `scripts/record_spot_fixtures.py`, the `overpass_candidates.json` and `nws_*.json` fixtures that only these used, and their tests (`test_spots*.py`, `test_spot_dedupe.py`, `test_overpass.py`, `test_planner.py`, `test_candidates.py`).
- `main.py` includes the three routers; `items.JOB_ROUTES` lists the two job routes; `public.py` / `public_outputs.py` carry `GET /api/public/spots` and `PublicSpot`; `analytics.py` lists `/denver` as a public path; `models.py` maps `Spot`, `Visit`, `Candidate`, `Dismissal`, `SpotSetting`, `CandidateSource`.
- Pins that count routes or list job routes (`test_recs_response_models.py`, `test_job_token.py`, `test_public_outputs.py`).

Frontend: `pages/Denver`, `AdminSpots`, `AdminWeekend`; `SpotCard`, `SpotFinder`, `SpotForm`, `SpotMap`, `CandidateCard`, `SuggestionCard`, `WeatherPanel`; `content/denver.js`, `content/maps/denver.js`, `scripts/draw-denver-map.*`; the `/denver` route, the footer and More links, the `spots` build snapshot and its presence flag, the prerender and sitemap entries, the search-index page, the `denver` admin area, the Admin Home Outings card, the Jobs rows for the spot finder, e2e specs and mocks, style-dump scenarios, tests and README sections.

Infra and docs: `.github/workflows/nightly.yml` steps `spots` (weekly) and the `spots` snapshot diff; `scripts/smoke.sh` checks for `/denver` and the spots routes; CLAUDE.md files, README, `docs/design-system.md` rows; one changelog entry (the Denver page was public and the changelog announced it).

## The one thing that is not Denver: the forecast

The Closet's Today reads the cached forecast (`weather.hours_for_day`, `weather_hours`), and `closet.py` leans on `weather.py`. The nightly forecast job lived in `spots_weekend_routes.py` only because the planner came first. So the forecast **stays**:

- `weather.py` stays, trimmed of the planner-only view builders (`day_view`, `verdict`, window helpers) and their tests.
- The job moves to `weather_routes.py`: `POST /api/weather/refresh` (was `/api/spots/weather/refresh`). Its last-run summary moves from `spot_settings["weather.last_run"]` to `closet_settings["weather.last_run"]`, read through `GET /api/closet/status` like the tag, plan and opinion rows. `nightly.yml`'s `weather` step changes only its path.
- Jobs page: the row stays (renamed "Forecast", purpose now the Closet's), its link goes to the Closet's Today page.
- `weather_hours` stays in the ORM.

## What is left in the database (for #632)

Not mapped by the ORM after this PR, still present, nothing written to them: tables `spots`, `visits`, `candidates`, `dismissals`, `spot_settings`; the enum type `candidate_source`. No column is removed from any table. The Postgres rows of `spot_settings` (`weather.last_run`, `plan:<week>`, `constraints`, `candidates.last_run`) are orphaned; production held no spots at the last check.

How the schema tests cope (as #537 did for the outing columns): `test_migrations.py`'s `_diff_against_models` already carries a carve-out for objects the models no longer have while the database keeps them. It gets one more, for those five tables, applied while the migrations still create them (until the drop migration of #632 lands and removes the carve-out). `test_schema_check.py` only pins the head revision and is untouched. The migrations 0013 and later stay as they are.

## Deliberately left

- `docs/planning/**` history and `docs/learnings.md`.
- `DrawnMap`, `mapFit` and the travel map, which are generic. Only Denver's `placeSpots` helper goes if nothing else uses it.
- `America/Denver` as the owner's time zone (`OWNER_TZ`, `DENVER_TZ`, `formatDate.js`, Daily's Denver day) and the Denver wording in the Closet's weather normals: Joey lives there; this is time zone and climate, not the feature.
- The word "weekend" as a Closet occasion.
- Old changelog entries (history); their `/denver` links render as plain text once the route is gone, as the changelog does for paths with no page.
- `render.yaml`: its `/denver` rewrite becomes dead. Infra, so not changed here; reported in the PR.

## Verification

Lint and format (frontend, `ruff`), targeted backend tests including `test_migrations.py` and `test_schema_check.py`, targeted frontend tests for each touched file, `VITE_DAILY_SALT=local npm run build`, a backend import check, then `rg` for live references. CI runs the rest; I read the real run.
