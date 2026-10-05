# Switch 1 Catalogue and Store List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the thousands of released Switch 1 physical games known to
Spine by reading the r/NSCollectors "Switch Physical Releases" sheet into the
physical catalogue, bulk-matching its titles to IGDB without a search each,
treating any Switch 1 cartridge in any region as a cartridge, and give the
owner a phone-first `/admin/store-list` to take into a store.

**Architecture:** A new pure parser `physical_sources/registry_switch1.py`
reuses `registry.py`'s Sheets helpers (made sheet-agnostic by defaulted
parameters) and writes `nscollectors_ns1` editions on platform 130. A pure
matcher `physical_sources/switch1_titles.py` matches every distinct key
against IGDB's Switch list, paged by name; a database module
`physical_sources/switch1_ingest.py` (the Switch 1 counterpart of
`platform_policy.py`) writes the decisions, fills snapshots and lets
`propagate` link the rows. `collapse.py` gains a per-platform region policy
(`REGION_FREE_PLATFORMS = {SWITCH}`). One admin route,
`POST /api/physical/refresh-switch1`, runs it under the catalogue write lock.
The store list is frontend only, over the existing recommendations
endpoints; Got it is the existing Already own. No migration, nothing public.

**Tech Stack:** Backend: FastAPI, SQLAlchemy 2 async on Postgres 18 (tests
against a real Postgres, `tests/conftest.py`), httpx2, pytest +
pytest-asyncio (strict, `pytest.mark.asyncio`), ruff (format + check,
`backend/ruff.toml`). Frontend: React 19, react-router 8 (declarative, from
`react-router`), Vite, Vitest 4 + Testing Library + jsdom, plain CSS tokens in
`src/index.css`, Prettier + ESLint.

**Spec:** `docs/planning/2026-10-04-switch1-catalogue-design.md`

## Global Constraints

- Sheet id: `1FNyvbbU64Pb9lheg28gC_5fMalIYJ0aD763T7M1QqF0`.
- Tabs by gid: Physical Release Master `2004832329`, CIAB `1406641930`. Tabs are found by gid, never by title.
- Edition source key: `nscollectors_ns1` (fits `physical_editions.source`, `String(20)`).
- Platform: `130` (`limits.SWITCH`). Format source for a sheet format: `registry`.
- No migration: every column, enum value and `MatchDecision.IGNORED` already exist.
- Nothing public: no public route, field or snapshot file; Switch 1 sheet dates are never registry dates for `/api/public/radar` (`collapse.REGISTRY_SOURCES` stays as is).
- Admin page title: `Store list · Admin`.
- IGDB is never a physical source for Switch 1: `POST /api/physical/refresh-platform?platform_id=130` stays 422 and `test_switch_1_is_never_ingested` stays green, unedited.
- Fixtures first: no parser test runs on anything but recorded bytes from `scripts/record_physical_fixtures.py`; fixtures are never edited by hand.
- Pure modules (`registry_switch1.py`, `switch1_titles.py`) import no FastAPI, SQLAlchemy, `models` or `db`; `tests/test_physical_imports.py` enforces it.
- Commits: conventional, ≤5 files each, each independently green, every message ending with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, merge or rebase.
- After every backend file change: `cd backend && ./.venv/bin/ruff format <files> && ./.venv/bin/ruff check <files>` (CI runs `ruff format --check .` and `ruff check .`).
- After every frontend file change: `cd frontend && npx prettier --write <files> && npx eslint <files>`; zero errors, warnings flagged.
- Test commands: `cd backend && ./.venv/bin/pytest` (one file: `./.venv/bin/pytest tests/<file>`), `cd frontend && npm test` (one file: `npm test -- <path>`).
- Style with tokens only, never raw hex; nothing hover-only; large tap targets on the store list.

## File map

| File | Responsibility | Tasks |
|---|---|---|
| `backend/scripts/record_physical_fixtures.py` | Records the Switch 1 sheet and IGDB Switch titles | 1 |
| `backend/tests/test_record_physical_fixtures.py` | Recorder tests | 1 |
| `backend/scripts/README.md` | Recorder docs | 1 |
| `backend/tests/fixtures/physical/registry_switch1/{properties,master,ciab}.json` (new, recorded) | Sheet fixtures | 2 |
| `backend/tests/fixtures/physical/igdb/switch_titles_{p1,deaths_door}.json` (new, recorded) | IGDB title fixtures | 2 |
| `backend/physical_sources/registry.py` | Sheet-agnostic helpers, `unique_by_ref` | 3 |
| `backend/tests/test_physical_registry.py` | Refactor tests | 3 |
| `backend/physical_sources/limits.py` | `SWITCH_1_CART_ID_PATTERN`, `REGION_FREE_PLATFORMS` | 4, 6 |
| `backend/physical_sources/registry_switch1.py` (new) | Pure Switch 1 sheet parser | 4 |
| `backend/tests/test_physical_registry_switch1.py` (new) | Parser tests on fixtures | 4 |
| `backend/physical_sources/switch1_titles.py` (new) | Pure bulk title matcher | 5 |
| `backend/tests/test_physical_switch1_titles.py` (new) | Matcher tests | 5 |
| `backend/physical_sources/collapse.py` | Region-free collapse for 130 | 6 |
| `backend/tests/test_physical_collapse.py` | Collapse tests | 6 |
| `backend/physical_sources/switch1_ingest.py` (new) | Titles, editions, decisions, snapshots | 7 |
| `backend/tests/test_physical_switch1_ingest.py` (new) | Ingest tests (Postgres) | 7 |
| `backend/tests/physical_support.py` | Fake IGDB Switch titles; fixture server for the Switch 1 sheet | 7, 8 |
| `backend/tests/test_physical_imports.py` | `switch1_ingest` is database layer | 7 |
| `backend/physical_sources/platform_policy.py` | Docstring: Switch 1 comes from the registry | 7 |
| `backend/physical_routes.py` | `refresh-switch1`, status, store refresh releases ignores | 8 |
| `backend/tests/test_physical_routes.py` | Route tests | 8 |
| `frontend/src/pages/AdminCatalogue.jsx` · `.test.jsx` | Refresh Switch 1, unmatched line | 9 |
| `frontend/src/pages/AdminStoreList.jsx` · `.test.jsx` (new) · `frontend/src/index.css` | Store list page | 10 |
| `frontend/src/App.jsx` · `App.test.jsx` · `pages/Admin.jsx` · `pages/Admin.test.jsx` | Route, title row, admin link | 11 |
| `scripts/smoke.sh` | Two new checks | 12 |
| `backend/physical_sources/README.md` · `CLAUDE.md` · `README.md` | Docs | 13 |

## Decisions taken against the code

These settle the spec's open points and the places where the code differs
from the spec's assumptions. Each is restated in the task it shapes.

1. **`propagate` gets no protection for `nscollectors_ns1`** (spec B's open
   point). `resolve.propagate` (`resolve.py:326-374`) excludes
   `igdb_platform` rows because N64 editions carry ids that came from IGDB
   directly. Switch 1 editions carry no id of their own: the bulk matcher
   writes one `catalogue_matches` decision per `(title_normalized, 130)` key
   and `propagate` is what copies it onto the editions. Protecting them would
   leave them unlinked forever, and a later manual link in Needs match must be
   able to override an automatic one. So the matcher decides, and `propagate`
   links, exactly as for the Switch 2 registry.
2. **An automatic ignore is marked by `match_confidence = UNCERTAIN`.**
   `resolve.ignore` (`resolve.py:509-519`) writes a human's ignore with
   `match_confidence = NULL`; nothing else writes `IGNORED` + `UNCERTAIN`. That
   lets the matcher revisit only its own ignores (a title IGDB adds later, or a
   store starts selling) and never a human's, with no schema change.
3. **The store-listing exception holds after later store refreshes too.** The
   stores route (`POST /api/physical/refresh`) calls
   `release_listed_ignores` before its resolve batch, so a Switch 1 title a
   store starts selling is handed to Resolve without waiting for the next
   Switch 1 refresh.
4. **`registry.py` is made sheet-agnostic, not copied.** `fetch_properties`,
   `fetch_tab` and `tab_titles` are hard-wired to the Switch 2 sheet
   (`registry.py:31-35`, `69-80`, `271-287`) and `merge` builds Switch 2 rows
   through `_edition` (`registry.py:197-231`), so they gain defaulted
   `sheet_id` / `tabs` parameters and the dedupe moves into `unique_by_ref`,
   which `merge` and the Switch 1 parser share. `_cart_id` uses the Switch 2
   `CART_ID_PATTERN` (`limits.py:56`), which matches no Switch 1 cart ID
   (`LA-H-XXXXX-RRR`), so it gains a `pattern` parameter and `limits.py`
   gains `SWITCH_1_CART_ID_PATTERN`.
5. **The database side lives in a new `switch1_ingest.py`,** the Switch 1
   counterpart of `platform_policy.py`. `store_games` and `fill_games` are in
   `resolve.py` (`resolve.py:265`, `286`), not `catalogue.py`, and
   `catalogue.py` owns no match decisions.
6. **Switch 1 sheet dates stay out of `collapse.REGISTRY_SOURCES`.** Radar's
   pool covers 130 (`radar_load.py:34`) and `/api/public/radar` publishes
   rows whose `release_source` is `registry` (`public_outputs.py:205`).
   Counting the Switch 1 sheet as a registry date source would let it reach a
   public route; leaving it out keeps "nothing public" true with no Radar
   change.
7. **"N Switch 1 titles unmatched"** counts automatic ignores on 130 that a
   live `nscollectors_ns1` edition still carries (`count_unmatched`), served
   as `totals.switch1_unmatched` by `GET /api/physical/status`. A human's
   ignore of a store key on 130 is not a registry title.
8. **Radar rows need `?kind=radar`.** `GET /api/recommendations` requires
   `kind` (`recommendations_routes.py:427`); the store list reads
   `?kind=discover` and `?kind=radar`.
9. **Store list sections, where the spec is silent:** a Radar row that is a
   Game-Key Card, a code in a box or digital-only (`lane === 'digital'`) is
   Skip in store; a physical Radar row of unknown format is left off (no
   advice to give); a game listed by both Discover and Radar shows once, under
   its first section.
10. **Switch 1 keys are not added to `test_physical_keys.py`'s corpus.** That
    test holds store and Switch 2 keys to the key-quality rules; holding 4,200
    community titles to them is a separate piece of work. The physical
    catalogue README says so.

---

## Zone 1

### Task 1: Recorder learns the Switch 1 sheet and IGDB's Switch titles

**Files:**
- Modify: `backend/scripts/record_physical_fixtures.py`
- Modify: `backend/tests/test_record_physical_fixtures.py`
- Modify: `backend/scripts/README.md`

**Interfaces:**
- Consumes: the recorder's `Recorder`, `SOURCES`, `_hosts`, `_header_index`, `_a1_sheet`, `config.load_config`, `sources.igdb.IgdbSource._query`.
- Produces: source name `registry_switch1` in `SOURCES`; constants `SWITCH1_SHEET_ID`, `SWITCH1_SHEETS_API`, `SWITCH1_TABS = {"master": 2004832329, "ciab": 1406641930}`, `SWITCH1_REQUIRED`, `SWITCH1_MASTER_HEADER`, `SWITCH1_CART_ID`, `IGDB_SWITCH_QUERY`, `IGDB_SWITCH_DEATHS_DOOR_QUERY`; `async record_registry_switch1(recorder: Recorder, key: str | None) -> None`; `async record_igdb_switch(recorder: Recorder) -> None`; `describe_dynamic(names: list[str], igdb: bool, igdb_switch: bool = False) -> list[str]`; `record(names, igdb, all_pages=False, strip_bodies=False, igdb_switch=False)`; CLI flag `--igdb-switch`. Writes `registry_switch1/{properties,master,ciab}.json`, `igdb/switch_titles_p1.json`, `igdb/switch_titles_deaths_door.json`.

There is no trimming mechanism for sheet tabs (the tracker's excerpt exists
for a licence reason; `--strip-bodies` is for store pages), so the tabs are
recorded whole. The Master tab is expected at about 1–2 MB, far under the
recorder's 20 MB body cap and 40 MB size gate; the run prints each tab's size.

- [ ] **Step 1: Write the failing tests** — append to `backend/tests/test_record_physical_fixtures.py`:

```python
def test_the_switch_1_sheet_needs_no_robots_txt():
    assert recorder._hosts(["registry_switch1"]) == []


def test_the_plan_lists_both_switch_1_tabs_and_the_igdb_files():
    lines = recorder.describe_dynamic(["registry_switch1"], False, igdb_switch=True)
    assert any(
        "gid 2004832329" in line and "registry_switch1/master.json" in line
        for line in lines
    )
    assert any(
        "gid 1406641930" in line and "registry_switch1/ciab.json" in line
        for line in lines
    )
    assert any("igdb/switch_titles_p1.json" in line for line in lines)
    assert any("igdb/switch_titles_deaths_door.json" in line for line in lines)


def test_the_igdb_switch_query_pages_by_name_only():
    assert recorder.IGDB_SWITCH_QUERY == (
        "where platforms = (130); "
        "fields id,name,first_release_date,alternative_names.name; "
        "sort id asc; limit 500; offset 0;"
    )


def _record_switch_1(tmp_path, monkeypatch, properties, values):
    monkeypatch.setattr(recorder, "FIXTURES", tmp_path)
    monkeypatch.setattr(recorder, "REQUEST_INTERVAL", 0)
    paths = []

    def handler(request):
        paths.append(request.url.path)
        assert request.url.params["key"] == "sheet-key"
        if request.url.params.get("fields") == "sheets.properties":
            return httpx2.Response(200, json=properties)
        return httpx2.Response(200, json=values)

    async def run():
        async with httpx2.AsyncClient(
            transport=httpx2.MockTransport(handler)
        ) as client:
            rec = recorder.Recorder(client, ["sheet-key"])
            await recorder.record_registry_switch1(rec, "sheet-key")
            return rec.failures

    failures = asyncio.run(run())
    files = sorted(str(p.relative_to(tmp_path)) for p in tmp_path.rglob("*.json"))
    return files, failures, paths


SWITCH_1_PROPERTIES = {
    "sheets": [
        {"properties": {"sheetId": 2004832329, "title": "Physical Release Master"}},
        {"properties": {"sheetId": 1406641930, "title": "CIAB"}},
    ]
}


def test_the_switch_1_sheet_records_its_tab_list_and_both_tabs(
    tmp_path, monkeypatch
):
    values = {
        "values": [
            ["Switch Physical Releases"],
            [],
            [],
            ["Master TItle", "Game Title", "Region", "Cart ID"],
            ["Death's Door", "Death's Door", "USA", "LA-H-AAAAA-USA"],
        ]
    }
    files, failures, paths = _record_switch_1(
        tmp_path, monkeypatch, SWITCH_1_PROPERTIES, values
    )
    assert failures == []
    assert files == [
        "registry_switch1/ciab.json",
        "registry_switch1/master.json",
        "registry_switch1/properties.json",
    ]
    assert all(recorder.SWITCH1_SHEET_ID in path for path in paths)


def test_a_missing_switch_1_tab_is_a_failure(tmp_path, monkeypatch):
    properties = {"sheets": SWITCH_1_PROPERTIES["sheets"][:1]}
    files, failures, _ = _record_switch_1(
        tmp_path, monkeypatch, properties, {"values": []}
    )
    assert "registry_switch1/ciab.json" not in files
    assert any("no tab with gid 1406641930" in failure for failure in failures)


def test_without_a_key_the_switch_1_sheet_is_skipped(tmp_path, monkeypatch):
    monkeypatch.setattr(recorder, "FIXTURES", tmp_path)

    async def run():
        async with httpx2.AsyncClient(
            transport=httpx2.MockTransport(lambda request: httpx2.Response(500))
        ) as client:
            rec = recorder.Recorder(client, [])
            await recorder.record_registry_switch1(rec, None)
            return rec.failures

    assert "GOOGLE_SHEETS_API_KEY is not set" in asyncio.run(run())[0]
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && ./.venv/bin/pytest tests/test_record_physical_fixtures.py`
Expected: FAIL — `AttributeError: module 'record_physical_fixtures' has no attribute ...` (`describe_dynamic` rejects `igdb_switch`, `IGDB_SWITCH_QUERY`, `record_registry_switch1`, `SWITCH1_SHEET_ID` missing); `_hosts(["registry_switch1"])` raises `KeyError`.

- [ ] **Step 3: Implement** — in `backend/scripts/record_physical_fixtures.py`:

3a. Docstring: replace the paragraph starting "It records page 1 of every store handle" with:

```python
It records page 1 of every store handle in the E7c spec's STORES table, the
NSCollectors Switch 2 registry and the Switch 1 "Switch Physical Releases"
sheet through the Google Sheets API, an excerpt of switch2-tracker, one
Limited Run product page and every host's robots.txt into
tests/fixtures/physical/. With --igdb it also records one page of IGDB's N64
catalogue; with --igdb-switch, one page of IGDB's Switch titles and the
"Death's Door" search the Switch 1 matcher is tested on. Source names may be
given to record only those; --list prints the plan without fetching.
```

and in the credentials paragraph replace "and --igdb needs IGDB_CLIENT_ID and IGDB_CLIENT_SECRET" with "and --igdb and --igdb-switch need IGDB_CLIENT_ID and IGDB_CLIENT_SECRET".

3b. After `DETAILS_OPTIONAL = (...)` add:

```python
# The Switch 1 sheet ("Switch Physical Releases"). Fixture name -> gid.
SWITCH1_SHEET_ID = "1FNyvbbU64Pb9lheg28gC_5fMalIYJ0aD763T7M1QqF0"
SWITCH1_SHEETS_API = (
    f"https://sheets.googleapis.com/v4/spreadsheets/{SWITCH1_SHEET_ID}"
)
SWITCH1_TABS = {"master": 2004832329, "ciab": 1406641930}
SWITCH1_REQUIRED = ("Game Title", "Region")
# The Master header as the spec recorded it, typo included; the run says
# whether the live sheet still matches it.
SWITCH1_MASTER_HEADER = (
    "Master TItle",
    "Game Title",
    "Region",
    "Release Date",
    "Cart ID",
    "Publisher",
    "LP #",
    "Edition Info",
    "Other Info",
    "Verified By",
    "Check",
)
SWITCH1_CART_ID = re.compile(r"^LA-H-[A-Z0-9]{5}-[A-Z]{3}$")
```

3c. After `IGDB_N64_QUERY = (...)` add:

```python
# Keep in step with switch1_titles.FIELDS and page_query.
IGDB_SWITCH_QUERY = (
    "where platforms = (130); "
    "fields id,name,first_release_date,alternative_names.name; "
    "sort id asc; limit 500; offset 0;"
)
IGDB_SWITCH_DEATHS_DOOR_QUERY = (
    "search \"Death's Door\"; where platforms = (130); "
    "fields id,name,first_release_date,alternative_names.name; limit 50;"
)
```

3d. In `SOURCES`, after the `"registry"` entry add:

```python
    "registry_switch1": [
        (
            f"{SWITCH1_SHEETS_API}?fields=sheets.properties",
            "registry_switch1/properties.json",
        )
    ],
```

3e. In `_hosts`, replace `if name == "registry":` with `if name in ("registry", "registry_switch1"):`.

3f. Replace `describe_dynamic` with:

```python
def describe_dynamic(names: list[str], igdb: bool, igdb_switch: bool = False) -> list[str]:
    lines = []
    if "registry" in names:
        for tab, gid in SHEET_TABS.items():
            lines.append(
                f"{SHEETS_API}/values/<title of gid {gid}> -> registry/{tab}.json"
            )
    if "registry_switch1" in names:
        for tab, gid in SWITCH1_TABS.items():
            lines.append(
                f"{SWITCH1_SHEETS_API}/values/<title of gid {gid}> "
                f"-> registry_switch1/{tab}.json"
            )
    if "limited_run" in names:
        lines.append(
            "https://limitedrungames.com/products/<first Switch 2 product in "
            "coming-soon> -> shopify/limited_run/product.html"
        )
    if igdb:
        lines.append("IGDB /v4/games, N64 -> igdb/n64_page1.json")
    if igdb_switch:
        lines.append("IGDB /v4/games, Switch page 1 -> igdb/switch_titles_p1.json")
        lines.append(
            "IGDB /v4/games, Switch search \"Death's Door\" "
            "-> igdb/switch_titles_deaths_door.json"
        )
    return lines
```

3g. After `record_registry` add:

```python
def _switch1_report(tab: str, rows: list[list]) -> None:
    """The drift report for one Switch 1 tab: what the parser will meet."""
    header = _header_index(rows, SWITCH1_REQUIRED)
    if header is None:
        print(f"     HEADER NOT FOUND: no row has {', '.join(SWITCH1_REQUIRED)}")
        for index, row in enumerate(rows[:8]):
            print(f"     row {index}: {[str(cell)[:30] for cell in row[:12]]}")
        return
    columns = [str(cell).strip() for cell in rows[header]]
    folded = [column.casefold() for column in columns]
    body = rows[header + 1 :]
    print(f"     header at row {header}: {columns}")
    print(f"     data rows after header: {len(body)}")

    def values(name: str) -> list[str]:
        if name.casefold() not in folded:
            return []
        index = folded.index(name.casefold())
        return [
            str(row[index]).strip()
            for row in body
            if len(row) > index and str(row[index]).strip()
        ]

    print(f"     regions: {sorted(set(values('Region')))}")
    if tab == "master":
        same = [column for column in columns if column] == list(SWITCH1_MASTER_HEADER)
        print(f"     matches the spec's Master header: {same}")
        carts = values("Cart ID")
        shaped = sum(1 for cart in carts if SWITCH1_CART_ID.match(cart.upper()))
        print(f"     Cart IDs: {len(carts)} filled, {shaped} shaped LA-H-XXXXX-RRR")
        dates = sorted(set(values("Release Date")))
        print(f"     Release Date shapes: {dates[:5]} ... {dates[-5:]}")
        notes = [
            note
            for note in values("Other Info") + values("Edition Info")
            if "download" in note.casefold()
        ]
        print(f"     Other/Edition Info mentioning downloads: {len(notes)}")
        for note in notes[:10]:
            print(f"       - {note[:100]}")
    else:
        print(f"     CIAB only? values: {sorted(set(values('CIAB only?')))}")
    deaths_door = [
        [str(cell)[:40] for cell in row]
        for row in body
        if any(
            "death's door" in str(cell).casefold().replace("’", "'") for cell in row
        )
    ]
    print(f"     Death's Door rows: {len(deaths_door)}")
    for row in deaths_door:
        print(f"       {row}")


async def record_registry_switch1(recorder: Recorder, key: str | None) -> None:
    """The Switch 1 sheet: its tab list, then the Master and CIAB tabs whole."""
    if key is None:
        recorder.fail("registry_switch1", "GOOGLE_SHEETS_API_KEY is not set; skipped")
        return
    _, out = SOURCES["registry_switch1"][0]
    properties = await recorder.get_json(
        out, SWITCH1_SHEETS_API, {"fields": "sheets.properties", "key": key}
    )
    if properties is None:
        return
    recorder.write_json(out, out, properties)
    titles = {
        sheet.get("properties", {}).get("sheetId"): sheet.get("properties", {}).get(
            "title"
        )
        for sheet in properties.get("sheets", [])
    }
    print(f"ok   {out}  {len(titles)} tabs")
    for tab, gid in SWITCH1_TABS.items():
        out = f"registry_switch1/{tab}.json"
        title = titles.get(gid)
        print(f"     gid {gid} ({tab}) -> {title!r}")
        if not title:
            recorder.fail(out, f"no tab with gid {gid}")
            continue
        values_url = f"{SWITCH1_SHEETS_API}/values/{quote(_a1_sheet(title), safe='')}"
        payload = await recorder.get_json(out, values_url, {"key": key})
        if payload is None:
            continue
        recorder.write_json(out, out, payload)
        rows = payload.get("values", [])
        size = len(json.dumps(payload, ensure_ascii=False)) // 1024
        print(f"ok   {out}  {len(rows)} rows, {size} KB")
        _switch1_report(tab, rows)
```

3h. Replace `record_igdb` with a shared loader and two recorders:

```python
def _igdb_source(recorder: Recorder, out: str):
    """An IgdbSource on the API's own config, or None (recorded as a failure).
    Its credentials join the secrets every write and failure is checked for."""
    from sources.igdb import IgdbSource

    try:
        loaded = config.load_config()
    except config.ConfigError as error:
        recorder.fail(out, str(error))
        return None
    recorder.secrets += [
        secret
        for secret in (loaded.igdb_client_id, loaded.igdb_client_secret)
        if secret
    ]
    return IgdbSource(loaded)


async def record_igdb(recorder: Recorder) -> None:
    out = "igdb/n64_page1.json"
    igdb = _igdb_source(recorder, out)
    if igdb is None:
        return
    try:
        rows = await igdb._query(IGDB_N64_QUERY)
    except Exception as error:  # reported, redacted, and the run carries on
        recorder.fail(out, f"{type(error).__name__}: {error}")
        return
    recorder.write_json(out, out, rows)
    covered = sum(1 for row in rows if row.get("cover"))
    print(f"ok   {out}  {len(rows)} games, {covered} with a cover")


def _names(row: dict) -> set[str]:
    names = {str(row.get("name", ""))}
    names |= {
        str(alternative.get("name", ""))
        for alternative in row.get("alternative_names") or []
        if isinstance(alternative, dict)
    }
    return {name.casefold().replace("’", "'") for name in names if name}


async def record_igdb_switch(recorder: Recorder) -> None:
    """One page of IGDB's Switch titles and the Death's Door search, for the
    Switch 1 bulk matcher's tests."""
    queries = (
        ("igdb/switch_titles_p1.json", IGDB_SWITCH_QUERY),
        ("igdb/switch_titles_deaths_door.json", IGDB_SWITCH_DEATHS_DOOR_QUERY),
    )
    igdb = _igdb_source(recorder, queries[0][0])
    if igdb is None:
        return
    for out, query in queries:
        try:
            rows = await igdb._query(query)
        except Exception as error:  # reported, redacted, and the run carries on
            recorder.fail(out, f"{type(error).__name__}: {error}")
            continue
        recorder.write_json(out, out, rows)
        alternative = sum(1 for row in rows if row.get("alternative_names"))
        print(f"ok   {out}  {len(rows)} games, {alternative} with alternative names")
        if out.endswith("deaths_door.json"):
            exact = [row.get("id") for row in rows if "death's door" in _names(row)]
            print(f"     named or also known as \"Death's Door\": {exact}")
```

3i. In `record`: add the parameter `igdb_switch: bool = False` after `strip_bodies`; inside the `for name in names:` loop add the branch

```python
            elif name == "registry_switch1":
                await record_registry_switch1(recorder, sheets_key)
```

and after `if igdb: await record_igdb(recorder)` add

```python
        if igdb_switch:
            await record_igdb_switch(recorder)
```

3j. In `main`: after the `--igdb` argument add

```python
    parser.add_argument(
        "--igdb-switch",
        action="store_true",
        help="also record IGDB's Switch titles page 1 and the Death's Door search",
    )
```

change `describe_dynamic(names, args.igdb)` to `describe_dynamic(names, args.igdb, args.igdb_switch)`, and the last line to `asyncio.run(record(names, args.igdb, args.all_pages, args.strip_bodies, args.igdb_switch))`.

- [ ] **Step 4: Update `backend/scripts/README.md`** (`record_physical_fixtures.py` section):
  - In the source-name sentence, add `registry_switch1` to the list and append: "`--igdb-switch` adds one page of IGDB's Switch titles and its search for \"Death's Door\", for the Switch 1 bulk matcher."
  - In **Needs**, change the IGDB bullet to "`IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` for `--igdb` and `--igdb-switch`, …" and the Sheets bullet to "… for the registry and `registry_switch1`."
  - Change "It makes about 59 requests" to "It makes about 62 requests".
  - Add rows to the **Writes** table:

```markdown
| `registry_switch1/properties.json` | the Switch 1 sheet's tab list, mapping gid `2004832329` (Physical Release Master) and `1406641930` (CIAB) to their current titles |
| `registry_switch1/{master,ciab}.json` | the Switch 1 Master and code-in-a-box tabs, whole, as `spreadsheets.values.get` returns them; the run prints each tab's header, regions, cart-ID shapes, date shapes, any Other/Edition Info mentioning downloads, and the Death's Door rows |
| `igdb/switch_titles_p1.json` | with `--igdb-switch`: the first 500 IGDB Switch games by id, names and first release date only |
| `igdb/switch_titles_deaths_door.json` | with `--igdb-switch`: IGDB's Switch search for "Death's Door", same fields |
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd backend && ./.venv/bin/pytest tests/test_record_physical_fixtures.py` → all pass.
Then `./.venv/bin/ruff format scripts/record_physical_fixtures.py tests/test_record_physical_fixtures.py && ./.venv/bin/ruff check scripts/record_physical_fixtures.py tests/test_record_physical_fixtures.py`, and `./.venv/bin/python scripts/record_physical_fixtures.py --list registry_switch1 --igdb-switch` prints the properties URL, both tab lines and both IGDB lines.

- [ ] **Step 6: Commit** — boundary 1 (3 files)

```bash
git add backend/scripts/record_physical_fixtures.py backend/tests/test_record_physical_fixtures.py backend/scripts/README.md
git commit -m "feat: record the Switch 1 sheet and IGDB Switch titles" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Record the Switch 1 fixtures (fixtures first)

**Files:**
- Create (recorded, never edited): `backend/tests/fixtures/physical/registry_switch1/properties.json`, `.../registry_switch1/master.json`, `.../registry_switch1/ciab.json`, `backend/tests/fixtures/physical/igdb/switch_titles_p1.json`, `backend/tests/fixtures/physical/igdb/switch_titles_deaths_door.json`

**Interfaces:**
- Consumes: Task 1's recorder; `GOOGLE_SHEETS_API_KEY`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` and every other variable `config.load_config` requires, from `backend/.env` (the recorder loads config exactly as the API does).
- Produces: the five fixtures every later backend task reads.

This is the repo's own recorder run by hand: the only step in the plan that
calls external services (Sheets API: 3 requests; IGDB: 2 requests plus a
token). No credential is written: the recorder refuses any body containing
one and masks them in every message.

- [ ] **Step 1: Run the recorder**, saving the drift report to the scratchpad:

```bash
cd backend && ./.venv/bin/python scripts/record_physical_fixtures.py registry_switch1 --igdb-switch 2>&1 | tee "${TMPDIR:-/tmp}/switch1-record.txt"
```

(Use the session's scratchpad directory instead of `$TMPDIR` when one is
given; never write the report inside the repo.)

Expected: `ok` lines for `registry_switch1/properties.json`, `master.json`, `ciab.json`, `igdb/switch_titles_p1.json` (500 games), `igdb/switch_titles_deaths_door.json`; exit 0. A `FAIL` line or exit 1 → stop and report the (redacted) failure; do not retry in a loop.

- [ ] **Step 2: Read the drift report against the spec. STOP and report to Joey, committing nothing, if any of these holds:**
  - `matches the spec's Master header: False` (the header line is printed beside it). The parser in Task 4 is written against the spec's header.
  - The CIAB header lacks any of `Game Title`, `Region`, `CIAB only?` spelled exactly so, or `CIAB only? values` holds anything but `Yes`/`No`/blank.
  - `Death's Door rows: 0` in the Master tab, or none of its Master rows has a filled `Cart ID` (the spec's acceptance check is Death's Door as a Switch 1 cartridge).
  - `named or also known as "Death's Door"` lists anything other than exactly one id (the matcher's fixture test needs one unambiguous answer).
  - `Other/Edition Info mentioning downloads` is above 0: the spec (Open questions) revisits decision 5 (every Switch 1 cartridge is the full game) with the owner before parsing.
  - Any region is longer than 4 characters (`physical_editions.region` is `String(4)`).
  - Fewer than 90% of filled Cart IDs are `shaped LA-H-XXXXX-RRR`.

- [ ] **Step 3: Record the size** in the report: `du -h backend/tests/fixtures/physical/registry_switch1/*.json backend/tests/fixtures/physical/igdb/switch_titles_*.json`. Expected total well under 5 MB.

- [ ] **Step 4: Verify exactly five new files and nothing else changed**

Run: `git status --short`
Expected: the five paths above as untracked (`??`, or their directory), and no modified tracked file. Never edit a fixture; a wrong one is re-recorded.

- [ ] **Step 5: Commit** — boundary 2 (5 files)

```bash
git add backend/tests/fixtures/physical/registry_switch1/properties.json backend/tests/fixtures/physical/registry_switch1/master.json backend/tests/fixtures/physical/registry_switch1/ciab.json backend/tests/fixtures/physical/igdb/switch_titles_p1.json backend/tests/fixtures/physical/igdb/switch_titles_deaths_door.json
git commit -m "test: record the Switch 1 sheet and IGDB Switch title fixtures" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Make `registry.py`'s Sheets helpers sheet-agnostic

**Files:**
- Modify: `backend/physical_sources/registry.py`
- Modify: `backend/tests/test_physical_registry.py`

**Interfaces:**
- Produces (all defaults keep today's Switch 2 behaviour; no caller changes):
  - `SHEETS_ROOT = "https://sheets.googleapis.com/v4/spreadsheets"`
  - `tab_titles(properties: dict, tabs: dict[str, int] = TABS) -> dict[str, str]`
  - `_cart_id(value: str, pattern: re.Pattern = CART_ID_PATTERN) -> str | None`
  - `unique_by_ref(rows: Iterable[EditionRow]) -> list[EditionRow]`
  - `merge(details, upcoming) -> list[EditionRow]` (now `unique_by_ref` over `_edition`)
  - `async fetch_properties(client, key, throttle=None, sheet_id: str = SHEET_ID) -> dict`
  - `async fetch_tab(client, key, title, throttle=None, sheet_id: str = SHEET_ID) -> dict`

Why a refactor and not a copy: the spec reuses these helpers; three of them
are hard-wired to the Switch 2 sheet (decision 4).

- [ ] **Step 1: Write the failing tests** — in `backend/tests/test_physical_registry.py` add to the imports `import re`, `from dataclasses import replace`, `from urllib.parse import unquote`, `from physical_sources.base import EditionRow`, and to the `physical_sources.registry` import list `_cart_id`, `fetch_properties`, `fetch_tab`, `unique_by_ref`. Append:

```python
# --- Sheet-agnostic helpers (the Switch 1 sheet reuses them) ------------------------


def test_tab_titles_reads_any_sheets_gids():
    properties = {"sheets": [{"properties": {"sheetId": 7, "title": "Seven"}}]}
    assert tab_titles(properties, {"seven": 7}) == {"seven": "Seven"}


def test_tab_titles_names_a_missing_gid_of_any_sheet():
    with pytest.raises(SheetSchemaError, match="eight"):
        tab_titles({"sheets": []}, {"eight": 8})


def _row(ref: str) -> EditionRow:
    return EditionRow(
        source="test",
        source_ref=ref,
        title="T",
        title_normalized="t",
        platform_id=130,
        region="USA",
        is_physical=True,
        physical_format=None,
        format_source=None,
    )


def test_unique_by_ref_keeps_the_first_of_each_ref():
    first, second = _row("a"), _row("b")
    again = replace(_row("a"), title="Later")
    assert unique_by_ref([first, second, again]) == [first, second]


def test_cart_id_takes_another_platforms_pattern():
    switch_1 = re.compile(r"^LA-H-[A-Z0-9]{5}-[A-Z]{3}$")
    assert _cart_id(" la-h-aqxha-usa ", switch_1) == "LA-H-AQXHA-USA"
    # The default is the Switch 2 shape, which no Switch 1 cart ID has.
    assert _cart_id("LA-H-AQXHA-USA") is None


@pytest.mark.asyncio
async def test_fetching_reads_another_sheet_by_id():
    paths = []

    def handler(request):
        paths.append(unquote(request.url.path))
        if request.url.params.get("fields") == "sheets.properties":
            return httpx2.Response(200, json={"sheets": []})
        return httpx2.Response(200, json={"values": []})

    async with _client(handler) as client:
        await fetch_properties(client, "k", sheet_id="other-sheet")
        await fetch_tab(client, "k", "Tab One", sheet_id="other-sheet")
    assert paths == [
        "/v4/spreadsheets/other-sheet",
        "/v4/spreadsheets/other-sheet/values/'Tab One'",
    ]
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && ./.venv/bin/pytest tests/test_physical_registry.py`
Expected: FAIL — `ImportError: cannot import name 'unique_by_ref'`.

- [ ] **Step 3: Implement** in `backend/physical_sources/registry.py`:

3a. Imports: add `import re` after `import logging`, and `from collections.abc import Iterable` after it.

3b. Replace the `SHEETS_API` line with:

```python
SHEETS_ROOT = "https://sheets.googleapis.com/v4/spreadsheets"
SHEETS_API = f"{SHEETS_ROOT}/{SHEET_ID}"
```

3c. Replace `tab_titles` with:

```python
def tab_titles(properties: dict, tabs: dict[str, int] = TABS) -> dict[str, str]:
    """{tab: current title} for `tabs` (this sheet's TABS by default), from a
    sheets.properties response."""
    by_gid = {
        sheet.get("properties", {}).get("sheetId"): sheet.get("properties", {}).get(
            "title"
        )
        for sheet in properties.get("sheets", [])
    }
    missing = [f"{tab} (gid {gid})" for tab, gid in tabs.items() if not by_gid.get(gid)]
    if missing:
        raise SheetSchemaError(f"sheet tab not found: {', '.join(missing)}")
    return {tab: by_gid[gid] for tab, gid in tabs.items()}
```

3d. Replace `_cart_id` with:

```python
def _cart_id(value: str, pattern: re.Pattern = CART_ID_PATTERN) -> str | None:
    """The cell as a cart ID in `pattern`'s shape (Switch 2's by default), or
    None: "N/A", blanks and other platforms' IDs are not one."""
    cart_id = value.strip().upper()
    return cart_id if pattern.match(cart_id) else None
```

3e. Replace `merge` with:

```python
def unique_by_ref(rows: Iterable[EditionRow]) -> list[EditionRow]:
    """The rows in order, a source_ref already seen dropped, so a repeated
    row never reaches the (source, source_ref) unique key twice."""
    seen: set[str] = set()
    unique: list[EditionRow] = []
    for row in rows:
        if row.source_ref in seen:
            continue
        seen.add(row.source_ref)
        unique.append(row)
    return unique


def merge(details: list[dict], upcoming: list[dict]) -> list[EditionRow]:
    """One EditionRow per row of either tab; Release Details wins over
    Upcoming Releases for a shared source_ref."""
    return unique_by_ref(_edition(row) for row in (*details, *upcoming))
```

3f. Replace `fetch_properties` and `fetch_tab` with:

```python
async def fetch_properties(
    client, key: str, throttle: HostThrottle | None = None, sheet_id: str = SHEET_ID
) -> dict:
    """GET /v4/spreadsheets/{sheet_id}?fields=sheets.properties."""
    # Every query parameter goes in `params`: httpx2 replaces a URL's own
    # query string with them rather than merging.
    return await _get_json(
        client,
        f"{SHEETS_ROOT}/{sheet_id}",
        {"fields": "sheets.properties", "key": key},
        throttle,
    )


async def fetch_tab(
    client,
    key: str,
    title: str,
    throttle: HostThrottle | None = None,
    sheet_id: str = SHEET_ID,
) -> dict:
    """GET /v4/spreadsheets/{sheet_id}/values/{title}: one whole tab."""
    url = f"{SHEETS_ROOT}/{sheet_id}/values/{quote(_a1_sheet(title), safe='')}"
    return await _get_json(client, url, {"key": key}, throttle)
```

3g. Module docstring: append the paragraph

```python
The fetch and tab helpers take a sheet id and a gid table, defaulting to
this sheet's: registry_switch1.py reads the Switch 1 sheet through them.
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd backend && ./.venv/bin/pytest tests/test_physical_registry.py tests/test_physical_routes.py tests/test_physical_keys.py` → all pass (the existing registry, route and key tests prove the defaults kept Switch 2 unchanged).
Then `./.venv/bin/ruff format physical_sources/registry.py tests/test_physical_registry.py && ./.venv/bin/ruff check physical_sources/registry.py tests/test_physical_registry.py`.

- [ ] **Step 5: Commit** — boundary 3 (2 files)

```bash
git add backend/physical_sources/registry.py backend/tests/test_physical_registry.py
git commit -m "refactor: let the registry's Sheets helpers read any sheet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: The Switch 1 sheet parser

**Files:**
- Modify: `backend/physical_sources/limits.py`
- Create: `backend/physical_sources/registry_switch1.py`
- Create: `backend/tests/test_physical_registry_switch1.py`

**Interfaces:**
- Consumes: Task 3's `tab_titles(properties, tabs)`, `fetch_properties(..., sheet_id=)`, `fetch_tab(..., sheet_id=)`, `_cart_id(value, pattern)`, `unique_by_ref`, plus `rows_from_values`, `locate_header`, `source_ref`, `SheetSchemaError`, `SheetsNotConfigured`; Task 2's fixtures.
- Produces:
  - `limits.SWITCH_1_CART_ID_PATTERN: re.Pattern` (`^LA-H-[A-Z0-9]{5}-[A-Z]{3}$`)
  - `registry_switch1.SOURCE = "nscollectors_ns1"`, `SHEET_ID`, `TABS = {"master": 2004832329, "ciab": 1406641930}`, `REQUIRED_MASTER`, `OPTIONAL_MASTER`, `REQUIRED_CIAB`, `OPTIONAL_CIAB`
  - `parse_master(rows: list[list[str]]) -> tuple[list[dict], list[str]]`
  - `parse_ciab(rows: list[list[str]]) -> tuple[list[dict], list[str]]`
  - `to_editions(master: list[dict], ciab: list[dict]) -> list[EditionRow]`
  - `async list_editions(client, key: str | None, throttle: HostThrottle | None = None) -> tuple[list[EditionRow], list[str]]` — raises `SheetsNotConfigured` without a key, `PhysicalSourceError` on any fetch problem; warnings are `master:<warning>` / `ciab:<warning>`.

- [ ] **Step 1: Read the recorded headers**

```bash
cd backend && ./.venv/bin/python -c "
import json
from physical_sources.registry import locate_header, rows_from_values
for tab, required in (('master', ('Game Title', 'Region')), ('ciab', ('Game Title', 'Region', 'CIAB only?'))):
    rows = rows_from_values(json.load(open(f'tests/fixtures/physical/registry_switch1/{tab}.json')))
    print(tab, [c.strip() for c in rows[locate_header(rows, required)] if c.strip()])
"
```

- [ ] **Step 2: Gate.** If the recorded header differs from the spec's (Master TItle | Game Title | Region | Release Date | Cart ID | Publisher | LP # | Edition Info | Other Info | Verified By | Check), STOP and report before writing the parser. Likewise STOP if the CIAB header has no `Game Title`, `Region` and `CIAB only?` columns spelled exactly so (Step 1 raises `SheetSchemaError` then). The spec never recorded the CIAB columns; the parser below assumes those three plus optional `Publisher` and `Release Date`.

- [ ] **Step 3: Write the failing tests** — create `backend/tests/test_physical_registry_switch1.py`:

```python
"""The Switch 1 registry reader, on the recorded Sheets API responses.

The first block pins the recorded shape the parser was written against. If
one of those fails after a re-record, stop and read the drift report rather
than loosening the test.
"""

import json
from pathlib import Path
from urllib.parse import unquote

import httpx2
import pytest

from matching import normalize_title
from physical_sources.limits import SWITCH, SWITCH_1_CART_ID_PATTERN
from physical_sources.parse import game_title, parse_loose_date, parse_ymd
from physical_sources.registry import (
    SheetSchemaError,
    SheetsNotConfigured,
    locate_header,
    rows_from_values,
    tab_titles,
)
from physical_sources.registry_switch1 import (
    REQUIRED_CIAB,
    REQUIRED_MASTER,
    SHEET_ID,
    SOURCE,
    TABS,
    list_editions,
    parse_ciab,
    parse_master,
    to_editions,
)

FIXTURES = Path(__file__).parent / "fixtures" / "physical" / "registry_switch1"
SPEC_MASTER_HEADER = [
    "Master TItle",
    "Game Title",
    "Region",
    "Release Date",
    "Cart ID",
    "Publisher",
    "LP #",
    "Edition Info",
    "Other Info",
    "Verified By",
    "Check",
]


def _load(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text())


def _rows(name: str) -> list[list[str]]:
    return rows_from_values(_load(name))


def _column(tab: str, required: tuple[str, ...], name: str) -> list[str]:
    """Every filled cell of one column below the header."""
    rows = _rows(tab)
    header = locate_header(rows, required)
    folded = [cell.strip().casefold() for cell in rows[header]]
    index = folded.index(name.casefold())
    return [row[index].strip() for row in rows[header + 1 :] if row[index].strip()]


@pytest.fixture(scope="module")
def master():
    return parse_master(_rows("master"))


@pytest.fixture(scope="module")
def ciab():
    return parse_ciab(_rows("ciab"))


@pytest.fixture(scope="module")
def editions(master, ciab):
    return to_editions(master[0], ciab[0])


# --- The recorded shape -------------------------------------------------------------


def test_the_master_header_is_the_specs():
    rows = _rows("master")
    header = rows[locate_header(rows, REQUIRED_MASTER)]
    assert [cell.strip() for cell in header if cell.strip()] == SPEC_MASTER_HEADER


def test_the_ciab_tab_has_the_columns_it_is_read_by():
    assert locate_header(_rows("ciab"), REQUIRED_CIAB) >= 0


def test_tab_titles_maps_both_switch_1_gids():
    titles = tab_titles(_load("properties"), TABS)
    assert set(titles) == {"master", "ciab"} and all(titles.values())


def test_every_region_fits_the_column(master, ciab):
    regions = {row["region"] for row in master[0] + ciab[0]}
    assert regions and all(len(region) <= 4 for region in regions)


def test_most_cart_ids_have_the_switch_1_shape():
    carts = _column("master", REQUIRED_MASTER, "Cart ID")
    shaped = [cart for cart in carts if SWITCH_1_CART_ID_PATTERN.match(cart.upper())]
    assert carts and len(shaped) >= 0.9 * len(carts)


def test_most_release_dates_parse():
    dates = _column("master", REQUIRED_MASTER, "Release Date")
    parsed = [text for text in dates if parse_ymd(text) or parse_loose_date(text)[0]]
    assert dates and len(parsed) >= 0.95 * len(dates)


# --- Parsing ------------------------------------------------------------------------


def test_both_tabs_parse_without_warnings(master, ciab):
    assert (master[1], ciab[1]) == ([], [])


def test_every_row_is_a_physical_switch_1_edition(editions):
    assert editions
    assert {(row.source, row.platform_id, row.is_physical) for row in editions} == {
        (SOURCE, SWITCH, True)
    }


def test_a_cart_id_makes_a_registry_cartridge(master):
    with_cart = [row for row in master[0] if row["cart_id"]]
    without = [row for row in master[0] if not row["cart_id"]]
    assert with_cart
    assert {row["physical_format"] for row in with_cart} == {"game_card"}
    assert all(row["physical_format"] is None for row in without)


def test_format_source_is_registry_exactly_when_there_is_a_format(editions):
    assert all(
        (row.format_source == "registry") == (row.physical_format is not None)
        for row in editions
    )


def test_the_cart_id_is_kept_on_the_edition(editions):
    carts = [row.cart_id for row in editions if row.cart_id]
    assert carts and all(SWITCH_1_CART_ID_PATTERN.match(cart) for cart in carts)


def test_ciab_only_rows_become_codes_in_a_box(ciab):
    yes = [v for v in _column("ciab", REQUIRED_CIAB, "CIAB only?") if v.casefold() == "yes"]
    assert ciab[0] and len(ciab[0]) <= len(yes)
    assert {row["physical_format"] for row in ciab[0]} == {"code_in_box"}


def test_deaths_door_is_a_switch_1_cartridge(editions):
    found = [row for row in editions if row.title_normalized == "death s door"]
    assert found and any(row.physical_format == "game_card" for row in found)


def test_keys_are_the_base_game(editions):
    assert all(
        row.title_normalized == normalize_title(game_title(row.title))
        for row in editions
    )


def test_refs_are_unique_and_the_key_loses_few_rows(master, ciab, editions):
    assert len({row.source_ref for row in editions}) == len(editions)
    assert len(editions) >= 0.98 * (len(master[0]) + len(ciab[0]))


# --- Shapes the recording may not show ---------------------------------------------

HEADER = list(SPEC_MASTER_HEADER)


def test_the_header_typo_and_lower_case_cells_are_read():
    row = ["Hades", "Hades", "usa", "2020/09/18", "la-h-aqxha-usa", "Supergiant"]
    found, warnings = parse_master([["Switch Physical Releases"], HEADER, row])
    assert warnings == []
    (edition,) = found
    assert (edition["region"], edition["cart_id"], edition["physical_format"]) == (
        "USA",
        "LA-H-AQXHA-USA",
        "game_card",
    )
    assert (edition["release_date"].isoformat(), edition["release_precision"]) == (
        "2020-09-18",
        "day",
    )


def test_a_missing_optional_column_is_a_warning_not_a_failure():
    (edition,), warnings = parse_master([["Game Title", "Region"], ["Hades", "USA"]])
    assert edition["physical_format"] is None
    assert "missing_column:Cart ID" in warnings


def test_a_missing_required_column_fails():
    with pytest.raises(SheetSchemaError):
        parse_master([["Game Title", "Publisher"], ["Hades", "Supergiant"]])


def test_rows_without_a_title_or_region_are_skipped():
    found, _ = parse_master([["Game Title", "Region"], ["", "USA"], ["Hades", ""]])
    assert found == []


def test_a_ciab_no_row_adds_nothing():
    rows = [
        ["Game Title", "Region", "Publisher", "CIAB only?"],
        ["A", "USA", "P", "Yes"],
        ["B", "USA", "P", "No"],
    ]
    found, _ = parse_ciab(rows)
    assert [row["title"] for row in found] == ["A"]


def test_a_cartridge_and_a_code_in_a_box_are_two_editions():
    master, _ = parse_master([["Game Title", "Region", "Publisher"], ["A", "USA", "P"]])
    ciab, _ = parse_ciab(
        [["Game Title", "Region", "Publisher", "CIAB only?"], ["A", "USA", "P", "Yes"]]
    )
    assert len(to_editions(master, ciab)) == 2


def test_two_printings_in_one_region_are_two_editions():
    master, _ = parse_master(
        [
            ["Game Title", "Region", "Publisher", "Edition Info"],
            ["A", "USA", "P", ""],
            ["A", "USA", "P", "Limited Edition"],
            ["A", "USA", "P", ""],
        ]
    )
    assert len(to_editions(master, [])) == 2


# --- Fetching -----------------------------------------------------------------------


def _a1(title: str) -> str:
    return "'" + title.replace("'", "''") + "'"


def _serving_the_fixtures(request):
    assert request.url.params["key"] == "test-key"
    assert SHEET_ID in request.url.path
    if request.url.params.get("fields") == "sheets.properties":
        return httpx2.Response(200, json=_load("properties"))
    ciab = _a1(tab_titles(_load("properties"), TABS)["ciab"])
    name = "ciab" if unquote(request.url.path).endswith(ciab) else "master"
    return httpx2.Response(200, json=_load(name))


@pytest.mark.asyncio
async def test_list_editions_reads_both_tabs_of_the_switch_1_sheet(editions):
    transport = httpx2.MockTransport(_serving_the_fixtures)
    async with httpx2.AsyncClient(transport=transport) as client:
        found, warnings = await list_editions(client, "test-key")
    assert (len(found), warnings) == (len(editions), [])


@pytest.mark.asyncio
async def test_without_a_key_the_switch_1_sheet_is_not_fetched():
    def refuse(request):
        raise AssertionError("fetched without a key")

    async with httpx2.AsyncClient(transport=httpx2.MockTransport(refuse)) as client:
        with pytest.raises(SheetsNotConfigured):
            await list_editions(client, None)
```

- [ ] **Step 4: Run them to verify they fail**

Run: `cd backend && ./.venv/bin/pytest tests/test_physical_registry_switch1.py`
Expected: FAIL — `ImportError: cannot import name 'SWITCH_1_CART_ID_PATTERN'` / `No module named 'physical_sources.registry_switch1'`.

- [ ] **Step 5: Implement**

5a. `backend/physical_sources/limits.py`, after `CART_ID_PATTERN`:

```python
# LA-H-AQXHA-USA: a Switch 1 cart's product code and region. Its own shape:
# no Switch 1 cart ID matches CART_ID_PATTERN.
SWITCH_1_CART_ID_PATTERN = re.compile(r"^LA-H-[A-Z0-9]{5}-[A-Z]{3}$")
```

5b. Create `backend/physical_sources/registry_switch1.py`:

```python
"""The r/NSCollectors Switch 1 sheet, "Switch Physical Releases", read through
the Google Sheets API with registry.py's helpers.

Two tabs, found by gid: Physical Release Master, one row per physical
release of a title in a region (about 4,200 titles), and the code-in-a-box
tab. A Master row with a Switch 1 cart ID (LA-H-...) is a full cartridge at
the registry tier; one without is physical with an unknown format. A CIAB
row marked "CIAB only? = Yes" is a code in a box; one marked No adds
nothing, because its cartridge is already in Master. Every Switch 1
cartridge counts as the full game (switch1 spec, decision 5).

Optional columns are matched without case: the sheet spells one "Master
TItle". It is read only to notice a header that moved; "LP #", "Other Info",
"Verified By" and "Check" are not read at all.

Only list_editions touches the network, through registry.fetch_properties
and registry.fetch_tab, which never put a request URL (and with it the key)
in an error.
"""

from __future__ import annotations

import logging

from matching import normalize_title
from physical_sources.base import EditionRow, HostThrottle
from physical_sources.limits import SWITCH, SWITCH_1_CART_ID_PATTERN
from physical_sources.parse import game_title, parse_loose_date, parse_ymd
from physical_sources.registry import (
    SheetsNotConfigured,
    _cart_id,
    fetch_properties,
    fetch_tab,
    locate_header,
    rows_from_values,
    source_ref,
    tab_titles,
    unique_by_ref,
)

logger = logging.getLogger(__name__)

SOURCE = "nscollectors_ns1"
SHEET_ID = "1FNyvbbU64Pb9lheg28gC_5fMalIYJ0aD763T7M1QqF0"
# Tab -> gid.
TABS = {"master": 2004832329, "ciab": 1406641930}

REQUIRED_MASTER = ("Game Title", "Region")
# Missing optional columns are warnings and NULL fields, never a failed run.
OPTIONAL_MASTER = (
    "Master Title",
    "Release Date",
    "Cart ID",
    "Publisher",
    "Edition Info",
)
REQUIRED_CIAB = ("Game Title", "Region", "CIAB only?")
OPTIONAL_CIAB = ("Publisher", "Release Date")

# The kind part of a source_ref: what a row of each tab is.
MASTER_KIND = "master"
CIAB_KIND = "code in box"


def _reader(rows: list[list[str]], required, optional):
    """(rows below the header, a cell reader, missing-column warnings)."""
    header_index = locate_header(rows, required)
    columns: dict[str, int] = {}
    for index, cell in enumerate(rows[header_index]):
        columns.setdefault(cell.strip().casefold(), index)
    warnings = [
        f"missing_column:{name}" for name in optional if name.casefold() not in columns
    ]

    def cell(row: list[str], name: str) -> str:
        index = columns.get(name.casefold())
        return row[index].strip() if index is not None and index < len(row) else ""

    return rows[header_index + 1 :], cell, warnings


def _release(text: str):
    released = parse_ymd(text)
    if released is not None:
        return released, "day"
    return parse_loose_date(text)


def parse_master(rows: list[list[str]]) -> tuple[list[dict], list[str]]:
    """Master tab rows -> (editions as dicts, warnings)."""
    body, cell, warnings = _reader(rows, REQUIRED_MASTER, OPTIONAL_MASTER)
    editions: list[dict] = []
    for row in body:
        title, region = cell(row, "Game Title"), cell(row, "Region").upper()
        if not title or not region:
            continue
        cart_id = _cart_id(cell(row, "Cart ID"), SWITCH_1_CART_ID_PATTERN)
        released, precision = _release(cell(row, "Release Date"))
        editions.append(
            {
                "title": title,
                "region": region,
                "kind": MASTER_KIND,
                "physical_format": "game_card" if cart_id else None,
                "cart_id": cart_id,
                "publisher": cell(row, "Publisher") or None,
                "editions": cell(row, "Edition Info") or None,
                "release_date": released,
                "release_precision": precision,
            }
        )
    return editions, warnings


def parse_ciab(rows: list[list[str]]) -> tuple[list[dict], list[str]]:
    """CIAB tab rows -> (code-in-a-box editions as dicts, warnings); only
    rows marked "CIAB only? = Yes"."""
    body, cell, warnings = _reader(rows, REQUIRED_CIAB, OPTIONAL_CIAB)
    editions: list[dict] = []
    for row in body:
        title, region = cell(row, "Game Title"), cell(row, "Region").upper()
        if not title or not region or cell(row, "CIAB only?").casefold() != "yes":
            continue
        released, precision = _release(cell(row, "Release Date"))
        editions.append(
            {
                "title": title,
                "region": region,
                "kind": CIAB_KIND,
                "physical_format": "code_in_box",
                "cart_id": None,
                "publisher": cell(row, "Publisher") or None,
                "editions": None,
                "release_date": released,
                "release_precision": precision,
            }
        )
    return editions, warnings


def _ref(row: dict) -> str:
    """registry.source_ref (title | REGION | publisher | kind), then the
    edition info: one publisher can print a standard and a limited edition
    of a title in one region."""
    return "|".join(
        (
            source_ref(row["title"], row["region"], row["publisher"], row["kind"]),
            normalize_title(row["editions"] or ""),
        )
    )


def _edition(row: dict) -> EditionRow:
    return EditionRow(
        source=SOURCE,
        source_ref=_ref(row),
        title=row["title"],
        title_normalized=normalize_title(game_title(row["title"])),
        platform_id=SWITCH,
        region=row["region"],
        is_physical=True,
        physical_format=row["physical_format"],
        format_source="registry" if row["physical_format"] else None,
        cart_id=row["cart_id"],
        publisher=row["publisher"],
        editions=row["editions"],
        release_date=row["release_date"],
        release_precision=row["release_precision"],
    )


def to_editions(master: list[dict], ciab: list[dict]) -> list[EditionRow]:
    """One EditionRow per row of either tab, each source_ref once (Master
    first)."""
    return unique_by_ref(_edition(row) for row in (*master, *ciab))


async def list_editions(
    client, key: str | None, throttle: HostThrottle | None = None
) -> tuple[list[EditionRow], list[str]]:
    """Every Switch 1 edition, and the warnings the run should record."""
    if not key:
        raise SheetsNotConfigured("GOOGLE_SHEETS_API_KEY is not set")
    properties = await fetch_properties(client, key, throttle, sheet_id=SHEET_ID)
    titles = tab_titles(properties, TABS)
    master_rows = rows_from_values(
        await fetch_tab(client, key, titles["master"], throttle, sheet_id=SHEET_ID)
    )
    ciab_rows = rows_from_values(
        await fetch_tab(client, key, titles["ciab"], throttle, sheet_id=SHEET_ID)
    )
    master, master_warnings = parse_master(master_rows)
    ciab, ciab_warnings = parse_ciab(ciab_rows)
    logger.info("switch 1 registry: %d master rows, %d ciab", len(master), len(ciab))
    warnings = [f"master:{w}" for w in master_warnings]
    warnings += [f"ciab:{w}" for w in ciab_warnings]
    return to_editions(master, ciab), warnings
```

- [ ] **Step 6: Run to verify they pass**

Run: `cd backend && ./.venv/bin/pytest tests/test_physical_registry_switch1.py tests/test_physical_imports.py` → all pass (the imports test picks up `registry_switch1` as pure by itself).
A failure in the "recorded shape" block is drift, not a bug: STOP and report it with the printed values; do not loosen a threshold.
Then `./.venv/bin/ruff format physical_sources/limits.py physical_sources/registry_switch1.py tests/test_physical_registry_switch1.py && ./.venv/bin/ruff check physical_sources/limits.py physical_sources/registry_switch1.py tests/test_physical_registry_switch1.py`.

- [ ] **Step 7: Commit** — boundary 4 (3 files)

```bash
git add backend/physical_sources/limits.py backend/physical_sources/registry_switch1.py backend/tests/test_physical_registry_switch1.py
git commit -m "feat: parse the r/NSCollectors Switch 1 sheet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Bulk title matcher (pure) — **parallel-safe** (after Task 2; shares no file with Tasks 3, 4, 6)

**Files:**
- Create: `backend/physical_sources/switch1_titles.py`
- Create: `backend/tests/test_physical_switch1_titles.py`

**Interfaces:**
- Consumes: `matching.normalize_title`, `matching.YEAR_TOLERANCE` (1), `parse.game_title`, `base.EditionRow`; Task 2's IGDB fixtures.
- Produces:
  - `PAGE = 500`; `FIELDS = "fields id,name,first_release_date,alternative_names.name;"`
  - `page_query(offset: int) -> str`
  - `@dataclass(frozen=True) SwitchTitle(igdb_id: int, year: int | None, names: frozenset[str], stripped: frozenset[str])`
  - `@dataclass(frozen=True) TitleIndex(exact: dict[str, tuple[SwitchTitle, ...]], stripped: dict[str, tuple[SwitchTitle, ...]])`
  - `parse_titles(rows: Iterable[object]) -> list[SwitchTitle]`
  - `build_index(titles: Iterable[SwitchTitle]) -> TitleIndex`
  - `match(key: str, year: int | None, index: TitleIndex) -> int | None`
  - `sheet_years(rows: Iterable[EditionRow]) -> dict[str, int | None]`

- [ ] **Step 1: Write the failing tests** — create `backend/tests/test_physical_switch1_titles.py`:

```python
"""Bulk matching of Switch 1 registry titles to IGDB's Switch list (pure)."""

import json
from datetime import UTC, date, datetime
from pathlib import Path

from matching import normalize_title
from physical_sources.base import EditionRow
from physical_sources.switch1_titles import (
    PAGE,
    build_index,
    match,
    page_query,
    parse_titles,
    sheet_years,
)

IGDB = Path(__file__).parent / "fixtures" / "physical" / "igdb"


def row(igdb_id, name, year=2021, alternatives=()):
    return {
        "id": igdb_id,
        "name": name,
        "first_release_date": int(datetime(year, 7, 20, tzinfo=UTC).timestamp()),
        "alternative_names": [
            {"id": index, "name": alternative}
            for index, alternative in enumerate(alternatives)
        ],
    }


def index_of(*rows):
    return build_index(parse_titles(rows))


def edition(title, released):
    return EditionRow(
        source="nscollectors_ns1",
        source_ref=title,
        title=title,
        title_normalized=normalize_title(title),
        platform_id=130,
        region="USA",
        is_physical=True,
        physical_format=None,
        format_source=None,
        release_date=released,
    )


def test_one_exact_name_is_a_match():
    index = index_of(row(7, "Death's Door"), row(8, "Hades"))
    assert match("death s door", None, index) == 7


def test_two_exact_names_are_told_apart_by_the_sheets_year():
    index = index_of(row(1, "Doom", 1993), row(2, "Doom", 2016))
    # Within matching.YEAR_TOLERANCE of 2017: only the 2016 game.
    assert match("doom", 2017, index) == 2


def test_two_exact_names_with_no_sheet_year_stay_unmatched():
    index = index_of(row(1, "Doom", 1993), row(2, "Doom", 2016))
    assert match("doom", None, index) is None


def test_two_names_from_the_same_year_stay_unmatched():
    index = index_of(row(1, "Ys", 2020), row(2, "Ys", 2020))
    assert match("ys", 2020, index) is None


def test_no_name_is_no_match():
    assert match("obscure port", 2021, index_of(row(7, "Death's Door"))) is None


def test_an_alternative_name_matches():
    index = index_of(row(5, "Shin Megami Tensei V", alternatives=("SMT V",)))
    assert match("smt v", None, index) == 5


def test_an_exact_name_beats_a_stripped_one():
    index = index_of(row(1, "Hades"), row(2, "Hades Deluxe Edition"))
    assert match("hades", None, index) == 1


def test_a_stripped_name_answers_when_no_exact_one_does():
    assert match("hades", None, index_of(row(2, "Hades Deluxe Edition"))) == 2


def test_malformed_rows_are_skipped():
    titles = parse_titles(
        [
            "junk",
            {"id": "7", "name": "String id"},
            {"id": 8},
            {"id": 9, "name": "   "},
            {"id": 10, "name": "Ok", "alternative_names": ["bad", {"name": 3}]},
        ]
    )
    assert [(t.igdb_id, t.names, t.year) for t in titles] == [
        (10, frozenset({"ok"}), None)
    ]


def test_sheet_years_are_the_earliest_per_key():
    rows = [
        edition("Hades", date(2021, 3, 1)),
        edition("Hades", date(2020, 9, 18)),
        edition("Ys", None),
    ]
    assert sheet_years(rows) == {"hades": 2020, "ys": None}


def test_page_query_pages_by_name_only():
    query = page_query(1000)
    assert query.startswith("where platforms = (130); ")
    assert "fields id,name,first_release_date,alternative_names.name;" in query
    assert f"limit {PAGE}; offset 1000;" in query


def test_the_recorded_page_parses_whole():
    rows = json.loads((IGDB / "switch_titles_p1.json").read_text())
    titles = parse_titles(rows)
    assert len(rows) == PAGE
    assert len(titles) == len([r for r in rows if (r.get("name") or "").strip()])


def test_deaths_door_matches_on_the_recorded_search():
    rows = json.loads((IGDB / "switch_titles_deaths_door.json").read_text())
    expected = next(r["id"] for r in rows if r["name"] == "Death's Door")
    assert match("death s door", None, build_index(parse_titles(rows))) == expected
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && ./.venv/bin/pytest tests/test_physical_switch1_titles.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'physical_sources.switch1_titles'`.

- [ ] **Step 3: Implement** — create `backend/physical_sources/switch1_titles.py`:

```python
"""Bulk matching of Switch 1 registry titles to IGDB's Switch list (switch1
spec B).

Pure. switch1_ingest pages IGDB with page_query -- ids, names and first
release dates only, tens of requests for every Switch game -- and this module
matches each registry key locally, so about 4,200 titles resolve without one
search each at IGDB's four requests a second.

A key is looked up in two tables. The exact table holds each game's name and
alternative names through normalize_title, the way registry keys are made;
the stripped table holds them through game_title first, so "Hades Deluxe
Edition" also answers "hades". The exact table is asked first and the
stripped one only when the exact one knows nothing: a base game and its
deluxe edition strip to one key, and the base game's own name should win.

One game is the match. Two or more are told apart by the sheet's earliest
release year: exactly one game within matching.YEAR_TOLERANCE of it, or no
match. No match is the caller's to handle (IGNORED, or left to Resolve when
a store lists the game).
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime

from matching import YEAR_TOLERANCE, normalize_title
from physical_sources.base import EditionRow
from physical_sources.parse import game_title

# IGDB's largest page.
PAGE = 500
# Keep in step with IGDB_SWITCH_QUERY in scripts/record_physical_fixtures.py,
# and re-record the fixtures when this changes.
FIELDS = "fields id,name,first_release_date,alternative_names.name;"


def page_query(offset: int) -> str:
    """One page of every Switch game, by id."""
    return (
        f"where platforms = (130); {FIELDS} sort id asc;"
        f" limit {PAGE}; offset {offset};"
    )


@dataclass(frozen=True)
class SwitchTitle:
    """One IGDB Switch game as the matcher reads it."""

    igdb_id: int
    year: int | None
    names: frozenset[str]
    stripped: frozenset[str]


@dataclass(frozen=True)
class TitleIndex:
    """Normalized name -> the games carrying it, per table."""

    exact: dict[str, tuple[SwitchTitle, ...]]
    stripped: dict[str, tuple[SwitchTitle, ...]]


def _year(value: object) -> int | None:
    """The year of IGDB's epoch seconds (as sources.igdb.year_from_unix,
    which this pure module cannot import: sources loads the models)."""
    if not isinstance(value, int) or isinstance(value, bool):
        return None
    try:
        return datetime.fromtimestamp(value, tz=UTC).year
    except (OverflowError, OSError, ValueError):
        return None


def _names(row: dict) -> list[str]:
    names = [row.get("name")]
    for alternative in row.get("alternative_names") or []:
        if isinstance(alternative, dict):
            names.append(alternative.get("name"))
    return [name for name in names if isinstance(name, str) and name.strip()]


def parse_titles(rows: Iterable[object]) -> list[SwitchTitle]:
    """IGDB rows -> SwitchTitles. A row without an integer id and a name is
    skipped, as is any alternative name that is not text."""
    titles: list[SwitchTitle] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        igdb_id, name = row.get("id"), row.get("name")
        if not isinstance(igdb_id, int) or not isinstance(name, str):
            continue
        if not name.strip():
            continue
        names = _names(row)
        titles.append(
            SwitchTitle(
                igdb_id=igdb_id,
                year=_year(row.get("first_release_date")),
                names=frozenset({normalize_title(n) for n in names} - {""}),
                stripped=frozenset(
                    {normalize_title(game_title(n)) for n in names} - {""}
                ),
            )
        )
    return titles


def _table(titles: list[SwitchTitle], field: str) -> dict[str, tuple[SwitchTitle, ...]]:
    table: dict[str, dict[int, SwitchTitle]] = {}
    for title in titles:
        for key in getattr(title, field):
            table.setdefault(key, {})[title.igdb_id] = title
    return {key: tuple(found.values()) for key, found in table.items()}


def build_index(titles: Iterable[SwitchTitle]) -> TitleIndex:
    titles = list(titles)
    return TitleIndex(exact=_table(titles, "names"), stripped=_table(titles, "stripped"))


def _pick(found: tuple[SwitchTitle, ...], year: int | None) -> int | None:
    if len(found) == 1:
        return found[0].igdb_id
    if year is None:
        return None
    near = [
        title
        for title in found
        if title.year is not None and abs(title.year - year) <= YEAR_TOLERANCE
    ]
    return near[0].igdb_id if len(near) == 1 else None


def match(key: str, year: int | None, index: TitleIndex) -> int | None:
    """The IGDB id for a registry key, or None."""
    for table in (index.exact, index.stripped):
        found = table.get(key)
        if found:
            return _pick(found, year)
    return None


def sheet_years(rows: Iterable[EditionRow]) -> dict[str, int | None]:
    """title_normalized -> the earliest release year among its rows, or None
    when none is dated; every key appears."""
    years: dict[str, int | None] = {}
    for row in rows:
        years.setdefault(row.title_normalized, None)
        if row.release_date is not None:
            current = years[row.title_normalized]
            year = row.release_date.year
            years[row.title_normalized] = year if current is None else min(current, year)
    return years
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd backend && ./.venv/bin/pytest tests/test_physical_switch1_titles.py tests/test_physical_imports.py` → all pass.
Then `./.venv/bin/ruff format physical_sources/switch1_titles.py tests/test_physical_switch1_titles.py && ./.venv/bin/ruff check physical_sources/switch1_titles.py tests/test_physical_switch1_titles.py`.

- [ ] **Step 5: Commit** — boundary 5 (2 files)

```bash
git add backend/physical_sources/switch1_titles.py backend/tests/test_physical_switch1_titles.py
git commit -m "feat: match Switch 1 registry titles to IGDB in bulk" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Region-free collapse for Switch 1

**Files:**
- Modify: `backend/physical_sources/limits.py` (after Task 4: shares this file, so not parallel with it)
- Modify: `backend/physical_sources/collapse.py`
- Modify: `backend/tests/test_physical_collapse.py`

**Interfaces:**
- Produces: `limits.REGION_FREE_PLATFORMS = frozenset({SWITCH})`; `collapse.collapse(...)` unchanged in signature, region-free on those platforms; `collapse.SOURCE_ORDER` and `collapse.SOURCE_NAMES` know `nscollectors_ns1`; `collapse.REGISTRY_SOURCES` unchanged (decision 6).

- [ ] **Step 1: Write the failing tests** — append to `backend/tests/test_physical_collapse.py`:

```python
# --- Switch 1: region-free ----------------------------------------------------------


def ns1(format, region="USA", **extra):
    return EditionView(
        id=f"e-ns1-{region}-{format}",
        source="nscollectors_ns1",
        region=region,
        platform_id=130,
        is_physical=True,
        physical_format=format,
        format_source="registry" if format else None,
        **extra,
    )


def test_switch_1_takes_a_cartridge_from_any_region():
    result = collapse(1, 130, [ns1("code_in_box"), ns1("game_card", "JPN")], [], GAME)
    assert (result.physical_format, result.region_of_answer) == ("game_card", "JPN")
    assert result.format_route == "r/NSCollectors (JPN)"
    assert result.format_note is None


def test_switch_1_reads_from_home_when_home_says_the_same():
    result = collapse(1, 130, [ns1("game_card", "EUR"), ns1("game_card")], [], GAME)
    assert (result.physical_format, result.region_of_answer) == ("game_card", "USA")


def test_switch_1_with_only_codes_in_a_box_is_a_code_in_a_box():
    result = collapse(1, 130, [ns1("code_in_box", "EUR")], [], GAME)
    assert result.physical_format == "code_in_box"


def test_switch_1_with_no_known_format_is_unknown():
    result = collapse(1, 130, [ns1(None), ns1(None, "JPN")], [], GAME)
    assert (result.physical_format, result.format_source) == (None, None)
    assert result.region_of_answer == "USA"


def test_switch_2_keeps_the_home_region_rule():
    key_card = EditionView(
        id="k",
        source="nscollectors",
        region="USA",
        platform_id=508,
        is_physical=True,
        physical_format="game_key_card",
        format_source="registry",
    )
    cartridge = EditionView(
        id="c",
        source="nscollectors",
        region="JPN",
        platform_id=508,
        is_physical=True,
        physical_format="game_card",
        format_source="registry",
    )
    result = collapse(1, 508, [key_card, cartridge], [], GAME)
    assert result.physical_format == "game_key_card"
    assert result.format_note == "Full game on cartridge in JPN — r/NSCollectors"


def test_a_switch_1_sheet_date_is_never_a_registry_date():
    """Only a registry date can be published (/api/public/radar); the Switch 1
    sheet is kept out of REGISTRY_SOURCES so nothing from it is public."""
    result = collapse(
        1, 130, [ns1("game_card", release_date=date(2021, 7, 20))], [], GAME
    )
    assert (result.release_date, result.release_source) == (
        GAME.release_date,
        "igdb_first",
    )
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && ./.venv/bin/pytest tests/test_physical_collapse.py`
Expected: FAIL — `test_switch_1_takes_a_cartridge_from_any_region` answers `code_in_box` from USA; `format_route` reads `nscollectors_ns1 (JPN)`.

- [ ] **Step 3: Implement**

3a. `backend/physical_sources/limits.py`, after `CARTRIDGE_ONLY_PLATFORMS`:

```python
# Region-free consoles with no Game-Key Card: a full cartridge in any region
# makes the game a cartridge (switch1 spec, decision 4). Switch 2 is not one:
# a Japanese cartridge and a US Game-Key Card are different products.
REGION_FREE_PLATFORMS = frozenset({SWITCH})
```

3b. `backend/physical_sources/collapse.py`:
- Import: `from physical_sources.limits import FORMAT_WORDS, HOME_REGION, REGION_FREE_PLATFORMS, REGISTRY_WORDS`.
- Docstring: append the paragraph

```python
On a region-free platform (REGION_FREE_PLATFORMS: Switch 1, which has no
Game-Key Card and no region lock) every region counts: any full cartridge
anywhere makes the game a cartridge, read from the home region when a home
row says the same.
```

- Constants:

```python
SOURCE_ORDER = (
    "nscollectors",
    "nscollectors_ns1",
    "switch2tracker",
    "igdb_platform",
    "manual",
)
```

```python
# Whose dates are registry dates, the only kind /api/public/radar publishes
# (showcase spec change 7). The Switch 1 sheet is left out on purpose:
# nothing from it is public (switch1 spec, Scope).
REGISTRY_SOURCES = ("nscollectors", "switch2tracker")
```

  and add `"nscollectors_ns1": "r/NSCollectors",` to `SOURCE_NAMES` after `"nscollectors"`.
- After `_best`, add:

```python
def _region_free_best(claims: list[_Claim], home_claims: list[_Claim]) -> _Claim | None:
    """The best claim in any region; a home claim saying the same is
    preferred, so the answer reads from home when it can."""
    best = _best(claims)
    at_home = _best(home_claims)
    if best is not None and at_home is not None and at_home.format == best.format:
        return at_home
    return best
```

- In `collapse`, replace

```python
    home_claims = [c for c in claims if c.region in (home, "ALL")]
    region = home
    if home_claims:
        chosen = _best(home_claims)
    else:
```

  with

```python
    home_claims = [c for c in claims if c.region in (home, "ALL")]
    region = home
    if platform_id in REGION_FREE_PLATFORMS:
        chosen = _region_free_best(claims, home_claims)
        if chosen is not None and chosen.region not in (home, "ALL"):
            region = chosen.region
    elif home_claims:
        chosen = _best(home_claims)
    else:
```

  (the `else:` body is unchanged).

- [ ] **Step 4: Run to verify they pass**

Run: `cd backend && ./.venv/bin/pytest tests/test_physical_collapse.py tests/test_radar.py tests/test_discover.py tests/test_radar_load.py tests/test_public_outputs.py` → all pass.
Then `./.venv/bin/ruff format physical_sources/limits.py physical_sources/collapse.py tests/test_physical_collapse.py && ./.venv/bin/ruff check physical_sources/limits.py physical_sources/collapse.py tests/test_physical_collapse.py`.

- [ ] **Step 5: Commit** — boundary 6 (3 files)

```bash
git add backend/physical_sources/limits.py backend/physical_sources/collapse.py backend/tests/test_physical_collapse.py
git commit -m "feat: collapse Switch 1 formats region-free" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: The Switch 1 ingest (database side)

**Files:**
- Create: `backend/physical_sources/switch1_ingest.py`
- Create: `backend/tests/test_physical_switch1_ingest.py`
- Modify: `backend/tests/physical_support.py` (`FakeIgdb`)
- Modify: `backend/tests/test_physical_imports.py`
- Modify: `backend/physical_sources/platform_policy.py` (docstring only)

**Interfaces:**
- Consumes: `catalogue.upsert_editions(session, rows, source, *, retire) -> (changed, retired)`, `catalogue.is_short(seen, previous)`, `resolve.fill_games(session, igdb, ids) -> int`, `resolve.propagate(session)`, Task 4's `registry_switch1.SOURCE`, Task 5's `PAGE`, `page_query`, `parse_titles`, `build_index`, `match`, `sheet_years`; the IGDB adapter's `configured()`, `_query(body)`, `fetch_many(ids)`.
- Produces:
  - `@dataclass Switch1Result(rows, changed, retired, short, matched, unmatched, left_to_resolve, games_fetched, fatal, errors: list[dict])`
  - `async load_switch_titles(igdb) -> list[dict]` (raises `SourceError` subclasses)
  - `async record_matches(session, rows: list[EditionRow], title_rows: list[dict]) -> tuple[list[int], int, int]`
  - `async release_listed_ignores(session) -> int`
  - `async count_unmatched(session) -> int`
  - `async ingest_switch1(session, igdb, rows: list[EditionRow], *, previous: int | None = None) -> Switch1Result`
  - `FakeIgdb(..., switch_titles: list[dict] | None = None, titles_error: Exception | None = None)` with `.queries: list[str]`; module function `recorded_switch_titles() -> list[dict]`.

**`propagate` decision (spec B's open point):** no protection for
`nscollectors_ns1` — see "Decisions taken against the code", item 1. The
matcher records one decision per key; `propagate` copies it onto the
editions (and onto any Switch 1 store listing with the same key), and clears
ids from ignored keys. Nothing in `resolve.py` changes.

- [ ] **Step 1: Extend the fake IGDB** — in `backend/tests/physical_support.py`:

1a. After the `N64_PAGE = ...` line add:

```python
SWITCH_TITLE_FILES = ("switch_titles_p1.json", "switch_titles_deaths_door.json")


def recorded_switch_titles() -> list[dict]:
    """IGDB's recorded Switch titles -- page 1 and the Death's Door search --
    each game once, by id: what the fake pages for platform 130."""
    rows: dict[int, dict] = {}
    for name in SWITCH_TITLE_FILES:
        for row in json.loads((N64_PAGE.parent / name).read_text()):
            rows.setdefault(row["id"], row)
    return [rows[key] for key in sorted(rows)]
```

1b. `FakeIgdb.__init__`: add the keyword parameters `switch_titles=None, titles_error=None` after `missing=()`, and in the body:

```python
        self.switch_titles = switch_titles
        self.titles_error = titles_error
        self.queries: list[str] = []
```

  Update the class docstring to "Stands in for IgdbSource: search, fetch_many and the raw queries (the N64 list and the Switch title pages)."

1c. Replace `FakeIgdb._query` with:

```python
    async def _query(self, body, endpoint="games"):
        self.queries.append(body)
        if "platforms = (130)" in body:
            if self.titles_error is not None:
                raise self.titles_error
            rows = (
                recorded_switch_titles()
                if self.switch_titles is None
                else self.switch_titles
            )
            offset = int(re.search(r"offset (\d+);", body).group(1))
            limit = int(re.search(r"limit (\d+);", body).group(1))
            return rows[offset : offset + limit]
        rows = json.loads(N64_PAGE.read_text())
        return [{"id": row["id"]} for row in rows]
```

- [ ] **Step 2: Write the failing tests** — create `backend/tests/test_physical_switch1_ingest.py`:

```python
"""The Switch 1 registry's database side: the title list, decisions, links.

Against the test Postgres, with the fake IGDB from physical_support.
"""

from datetime import UTC, date, datetime

import pytest
from physical_support import FakeIgdb
from sqlalchemy import func, select

from matching import normalize_title
from models import (
    CatalogueMatch,
    MatchConfidence,
    MatchDecision,
    PhysicalEdition,
    StoreListing,
)
from physical_sources.base import EditionRow
from physical_sources.switch1_ingest import (
    count_unmatched,
    ingest_switch1,
    load_switch_titles,
    release_listed_ignores,
)
from sources.base import SourceRateLimited

pytestmark = pytest.mark.asyncio


def ns1(title, region="USA", year=2021):
    key = normalize_title(title)
    return EditionRow(
        source="nscollectors_ns1",
        source_ref=f"{key}|{region}||master|",
        title=title,
        title_normalized=key,
        platform_id=130,
        region=region,
        is_physical=True,
        physical_format="game_card",
        format_source="registry",
        cart_id="LA-H-AAAAA-USA",
        release_date=date(year, 7, 20),
        release_precision="day",
    )


def igdb_row(igdb_id, name, year=2021):
    return {
        "id": igdb_id,
        "name": name,
        "first_release_date": int(datetime(year, 7, 20, tzinfo=UTC).timestamp()),
    }


def listing(key):
    return StoreListing(
        store="super_rare",
        store_product_id=key,
        variant_id=key,
        handle=key.replace(" ", "-"),
        url="https://example.test/x",
        region="EUR",
        title=key,
        title_normalized=key,
        platform_id=130,
        platform="Nintendo Switch",
        is_game=True,
        currency="GBP",
        availability="in_stock",
    )


def decided(key, confidence):
    return CatalogueMatch(
        title_normalized=key,
        platform_id=130,
        decided_by=MatchDecision.IGNORED,
        match_confidence=confidence,
    )


async def _seed(factory, *rows):
    async with factory() as session:
        session.add_all(rows)
        await session.commit()


async def _ingest(factory, rows, titles=(), igdb=None):
    igdb = igdb or FakeIgdb(switch_titles=list(titles))
    async with factory() as session:
        result = await ingest_switch1(session, igdb, rows, previous=None)
        await session.commit()
    return result


async def _decision(factory, key):
    async with factory() as session:
        return await session.get(CatalogueMatch, (key, 130))


async def _editions(factory):
    async with factory() as session:
        return list(await session.scalars(select(PhysicalEdition)))


async def test_the_title_list_is_paged_until_a_short_page():
    igdb = FakeIgdb(switch_titles=[igdb_row(i, f"Game {i}") for i in range(1, 1201)])
    rows = await load_switch_titles(igdb)
    assert len(rows) == 1200
    assert [query.rsplit("offset ", 1)[1] for query in igdb.queries] == [
        "0;",
        "500;",
        "1000;",
    ]


async def test_a_unique_title_is_decided_and_linked(sessionmaker_for_test):
    result = await _ingest(
        sessionmaker_for_test, [ns1("Death's Door")], [igdb_row(7, "Death's Door")]
    )
    assert (result.matched, result.unmatched, result.left_to_resolve) == (1, 0, 0)
    assert (result.fatal, result.errors, result.games_fetched) == (False, [], 1)
    decision = await _decision(sessionmaker_for_test, "death s door")
    assert (decision.decided_by, decision.match_confidence, decision.igdb_id) == (
        MatchDecision.AUTO,
        MatchConfidence.EXACT,
        7,
    )
    (edition,) = await _editions(sessionmaker_for_test)
    assert edition.igdb_id == 7


async def test_an_unmatched_title_is_ignored_automatically(sessionmaker_for_test):
    result = await _ingest(
        sessionmaker_for_test, [ns1("Obscure Port")], [igdb_row(7, "Death's Door")]
    )
    assert (result.matched, result.unmatched) == (0, 1)
    decision = await _decision(sessionmaker_for_test, "obscure port")
    assert (decision.decided_by, decision.match_confidence, decision.igdb_id) == (
        MatchDecision.IGNORED,
        MatchConfidence.UNCERTAIN,
        None,
    )
    async with sessionmaker_for_test() as session:
        assert await count_unmatched(session) == 1


async def test_a_title_a_store_lists_is_left_to_resolve(sessionmaker_for_test):
    await _seed(sessionmaker_for_test, listing("obscure port"))
    result = await _ingest(sessionmaker_for_test, [ns1("Obscure Port")])
    assert (result.unmatched, result.left_to_resolve) == (0, 1)
    assert await _decision(sessionmaker_for_test, "obscure port") is None


async def test_a_humans_ignore_is_never_touched(sessionmaker_for_test):
    await _seed(sessionmaker_for_test, decided("death s door", None))
    result = await _ingest(
        sessionmaker_for_test, [ns1("Death's Door")], [igdb_row(7, "Death's Door")]
    )
    assert result.matched == 0
    decision = await _decision(sessionmaker_for_test, "death s door")
    assert (decision.decided_by, decision.match_confidence) == (
        MatchDecision.IGNORED,
        None,
    )
    (edition,) = await _editions(sessionmaker_for_test)
    assert edition.igdb_id is None


async def test_an_automatic_ignore_is_reconsidered(sessionmaker_for_test):
    await _seed(sessionmaker_for_test, decided("death s door", MatchConfidence.UNCERTAIN))
    result = await _ingest(
        sessionmaker_for_test, [ns1("Death's Door")], [igdb_row(7, "Death's Door")]
    )
    assert result.matched == 1
    decision = await _decision(sessionmaker_for_test, "death s door")
    assert (decision.decided_by, decision.igdb_id) == (MatchDecision.AUTO, 7)


async def test_only_automatic_ignores_a_store_now_lists_are_released(
    sessionmaker_for_test,
):
    await _seed(
        sessionmaker_for_test,
        listing("obscure port"),
        decided("obscure port", MatchConfidence.UNCERTAIN),
        listing("kept port"),
        decided("kept port", None),
        decided("unlisted port", MatchConfidence.UNCERTAIN),
    )
    async with sessionmaker_for_test() as session:
        released = await release_listed_ignores(session)
        await session.commit()
    assert released == 1
    assert await _decision(sessionmaker_for_test, "obscure port") is None
    assert (await _decision(sessionmaker_for_test, "kept port")) is not None
    assert (await _decision(sessionmaker_for_test, "unlisted port")) is not None


async def test_without_igdb_nothing_is_written(sessionmaker_for_test):
    result = await _ingest(
        sessionmaker_for_test, [ns1("Death's Door")], igdb=FakeIgdb(configured=False)
    )
    assert result.fatal
    assert [error["code"] for error in result.errors] == ["igdb_not_configured"]
    assert await _editions(sessionmaker_for_test) == []


async def test_a_rate_limited_title_list_writes_nothing(sessionmaker_for_test):
    igdb = FakeIgdb(titles_error=SourceRateLimited("igdb", "rate limited by IGDB"))
    result = await _ingest(sessionmaker_for_test, [ns1("Death's Door")], igdb=igdb)
    assert result.fatal
    assert [error["code"] for error in result.errors] == ["igdb_rate_limited"]
    assert await _editions(sessionmaker_for_test) == []


async def test_a_rate_limit_filling_games_keeps_the_decisions(sessionmaker_for_test):
    igdb = FakeIgdb(switch_titles=[igdb_row(7, "Death's Door")])
    igdb.fetch_limited = True
    result = await _ingest(sessionmaker_for_test, [ns1("Death's Door")], igdb=igdb)
    assert result.fatal is False
    assert [error["code"] for error in result.errors] == ["igdb_rate_limited"]
    decision = await _decision(sessionmaker_for_test, "death s door")
    assert (decision.decided_by, decision.igdb_id) == (MatchDecision.AUTO, 7)
    # No game row yet, so nothing linked: the next Resolve fills and links it.
    (edition,) = await _editions(sessionmaker_for_test)
    assert edition.igdb_id is None


async def test_a_short_run_retires_nothing(sessionmaker_for_test):
    await _ingest(sessionmaker_for_test, [ns1("A"), ns1("B"), ns1("C")])
    async with sessionmaker_for_test() as session:
        result = await ingest_switch1(
            session, FakeIgdb(switch_titles=[]), [ns1("A")], previous=3
        )
        await session.commit()
        live = await session.scalar(
            select(func.count())
            .select_from(PhysicalEdition)
            .where(PhysicalEdition.retired_at.is_(None))
        )
    assert (result.short, result.retired, live) == (True, 0, 3)
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd backend && ./.venv/bin/pytest tests/test_physical_switch1_ingest.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'physical_sources.switch1_ingest'`.

- [ ] **Step 4: Implement**

4a. Create `backend/physical_sources/switch1_ingest.py`:

```python
"""The Switch 1 registry's database side (switch1 spec B).

refresh-switch1 reads the sheet (registry_switch1) and hands its editions to
ingest_switch1, which pages IGDB's Switch list by name (switch1_titles),
upserts the editions, decides each open key, fetches snapshots for what
matched and links the rows. IGDB is never a physical source here: a game is
physical because the sheet lists it; IGDB only names it.

One match is decided AUTO/EXACT, as the N64 ingest pre-decides its titles.
No match is IGNORED, so the titles IGDB spells differently never crowd Needs
match -- unless a live Switch 1 store listing carries the key, which is then
left undecided for Resolve: a store's game is never hidden by the registry's
spelling. An automatic ignore is written with match_confidence UNCERTAIN; a
human's (resolve.ignore) has none. Only automatic ignores are revisited --
on every Switch 1 refresh, and by release_listed_ignores after a store
refresh -- and no other decision is touched, so a manual link or a human's
ignore stands.

The editions carry no igdb_id of their own: propagate copies each key's
decision onto them, as it does for the Switch 2 registry. That is why
propagate protects igdb_platform rows (ids straight from IGDB) and not
these.

Nothing commits; the route owns the transaction.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import delete, func, select

from models import (
    CatalogueMatch,
    ListingAvailability,
    MatchConfidence,
    MatchDecision,
    PhysicalEdition,
    StoreListing,
)
from physical_sources.base import EditionRow
from physical_sources.catalogue import is_short, upsert_editions
from physical_sources.limits import SWITCH
from physical_sources.registry_switch1 import SOURCE
from physical_sources.resolve import fill_games, propagate
from physical_sources.switch1_titles import (
    PAGE,
    build_index,
    match,
    page_query,
    parse_titles,
    sheet_years,
)
from sources.base import SourceError, SourceNotConfigured, SourceRateLimited

# The title walk stops here even if IGDB keeps answering full pages: 50,000
# games is several times its Switch list.
MAX_TITLE_PAGES = 100


@dataclass
class Switch1Result:
    """What one Switch 1 refresh did, for its catalogue_runs row."""

    rows: int = 0
    changed: int = 0
    retired: int = 0
    short: bool = False
    matched: int = 0
    unmatched: int = 0
    left_to_resolve: int = 0
    games_fetched: int = 0
    # The title list could not be read, so nothing was written.
    fatal: bool = False
    errors: list[dict] = field(default_factory=list)


def _is_automatic_ignore(decision: CatalogueMatch) -> bool:
    return (
        decision.decided_by == MatchDecision.IGNORED
        and decision.match_confidence == MatchConfidence.UNCERTAIN
    )


def _automatic_ignores():
    return (
        CatalogueMatch.platform_id == SWITCH,
        CatalogueMatch.decided_by == MatchDecision.IGNORED,
        CatalogueMatch.match_confidence == MatchConfidence.UNCERTAIN,
    )


def _live_switch_1_listings():
    return select(StoreListing.title_normalized).where(
        StoreListing.platform_id == SWITCH,
        StoreListing.is_game.is_(True),
        StoreListing.availability != ListingAvailability.ARCHIVED,
    )


async def load_switch_titles(igdb) -> list[dict]:
    """Every IGDB Switch game as {id, name, first_release_date,
    alternative_names}, PAGE at a time. Raises the adapter's SourceErrors."""
    rows: list[dict] = []
    for page in range(MAX_TITLE_PAGES):
        # _query is the adapter's one query door; the platform listing is a
        # query no public method makes (as in platform_policy).
        batch = await igdb._query(page_query(page * PAGE))
        rows += batch
        if len(batch) < PAGE:
            return rows
    raise SourceError("igdb", f"more than {MAX_TITLE_PAGES} pages of Switch games")


async def record_matches(
    session, rows: list[EditionRow], title_rows: list[dict]
) -> tuple[list[int], int, int]:
    """Decides every open Switch 1 key among `rows`: no decision yet, or an
    automatic ignore. Returns (the IGDB ids matched, how many were ignored,
    how many were left to Resolve because a store lists them)."""
    years = sheet_years(rows)
    if not years:
        return [], 0, 0
    existing = {
        decision.title_normalized: decision
        for decision in await session.scalars(
            select(CatalogueMatch).where(
                CatalogueMatch.platform_id == SWITCH,
                CatalogueMatch.title_normalized.in_(list(years)),
            )
        )
    }
    open_keys = sorted(
        key
        for key in years
        if key not in existing or _is_automatic_ignore(existing[key])
    )
    if not open_keys:
        return [], 0, 0
    listed = set(
        await session.scalars(
            _live_switch_1_listings()
            .where(StoreListing.title_normalized.in_(open_keys))
            .distinct()
        )
    )
    index = build_index(parse_titles(title_rows))
    now = datetime.now(UTC)
    matched: list[int] = []
    unmatched = left = 0
    for key in open_keys:
        igdb_id = match(key, years[key], index)
        decision = existing.get(key)
        if igdb_id is None and key in listed:
            if decision is not None:
                await session.delete(decision)
            left += 1
            continue
        if decision is None:
            decision = CatalogueMatch(title_normalized=key, platform_id=SWITCH)
            session.add(decision)
        decision.igdb_id = igdb_id
        decision.candidates = []
        decision.decided_at = now
        if igdb_id is None:
            decision.match_confidence = MatchConfidence.UNCERTAIN
            decision.decided_by = MatchDecision.IGNORED
            unmatched += 1
        else:
            decision.match_confidence = MatchConfidence.EXACT
            decision.decided_by = MatchDecision.AUTO
            matched.append(igdb_id)
    await session.flush()
    return matched, unmatched, left


async def release_listed_ignores(session) -> int:
    """Drops the automatic ignores on Switch 1 that a live store listing now
    carries, so Resolve searches them. Returns how many."""
    result = await session.execute(
        delete(CatalogueMatch)
        .where(
            *_automatic_ignores(),
            CatalogueMatch.title_normalized.in_(_live_switch_1_listings()),
        )
        .execution_options(synchronize_session=False)
    )
    await session.flush()
    return result.rowcount or 0


async def count_unmatched(session) -> int:
    """The automatic ignores a live Switch 1 registry edition still carries:
    the catalogue page's "N Switch 1 titles unmatched"."""
    carried = select(PhysicalEdition.title_normalized).where(
        PhysicalEdition.source == SOURCE,
        PhysicalEdition.platform_id == SWITCH,
        PhysicalEdition.retired_at.is_(None),
    )
    return (
        await session.scalar(
            select(func.count())
            .select_from(CatalogueMatch)
            .where(
                *_automatic_ignores(),
                CatalogueMatch.title_normalized.in_(carried),
            )
        )
        or 0
    )


def _title_list_error(error: SourceError) -> dict:
    if isinstance(error, SourceRateLimited):
        return {"code": "igdb_rate_limited", "detail": "IGDB rate limit; press again"}
    if isinstance(error, SourceNotConfigured):
        return {"code": "igdb_not_configured", "detail": "IGDB credentials are not set"}
    return {"code": "http_error", "detail": str(error)}


async def ingest_switch1(
    session, igdb, rows: list[EditionRow], *, previous: int | None = None
) -> Switch1Result:
    """The sheet's editions, matched and linked.

    The title list is read before anything is written: without it every key
    would fall to Resolve, thousands of searches. `previous` is the last
    successful run's row count: a short run upserts and retires nothing.
    """
    result = Switch1Result()
    if not igdb.configured():
        result.fatal = True
        result.errors.append(
            {"code": "igdb_not_configured", "detail": "IGDB credentials are not set"}
        )
        return result
    try:
        title_rows = await load_switch_titles(igdb)
    except SourceError as error:
        result.fatal = True
        result.errors.append(_title_list_error(error))
        return result

    result.rows = len(rows)
    result.short = is_short(len(rows), previous)
    result.changed, result.retired = await upsert_editions(
        session, rows, SOURCE, retire=bool(rows) and not result.short
    )
    matched, result.unmatched, result.left_to_resolve = await record_matches(
        session, rows, title_rows
    )
    result.matched = len(matched)
    try:
        result.games_fetched = await fill_games(session, igdb, sorted(set(matched)))
    except SourceRateLimited:
        result.errors.append(
            {
                "code": "igdb_rate_limited",
                "detail": "IGDB rate limit filling games; Resolve fills the rest",
            }
        )
    except SourceError as error:
        result.errors.append({"code": "http_error", "detail": str(error)})
    # Links every decided key whose game row exists, these among them.
    await propagate(session)
    return result
```

4b. `backend/tests/test_physical_imports.py`: change the comment and set to

```python
# The database layer, and the two ingests, which drive the IGDB adapter.
IMPURE = {"catalogue", "resolve", "sync", "platform_policy", "switch1_ingest"}
```

4c. `backend/physical_sources/platform_policy.py` docstring: replace

```python
Switch 1 is cartridge-only too, but is never ingested: its candidates come
only from the stores (spec §2).
```

with

```python
Switch 1 is cartridge-only too, but is never ingested from IGDB, which cannot
tell a physical Switch game from a digital one: its candidates come from the
stores and the r/NSCollectors Switch 1 registry (switch1_ingest).
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd backend && ./.venv/bin/pytest tests/test_physical_switch1_ingest.py tests/test_physical_imports.py tests/test_physical_routes.py tests/test_physical_resolve.py` → all pass (routes and resolve prove the `FakeIgdb` change kept N64 behaviour).
Then `./.venv/bin/ruff format physical_sources/switch1_ingest.py physical_sources/platform_policy.py tests/test_physical_switch1_ingest.py tests/physical_support.py tests/test_physical_imports.py && ./.venv/bin/ruff check physical_sources/switch1_ingest.py physical_sources/platform_policy.py tests/test_physical_switch1_ingest.py tests/physical_support.py tests/test_physical_imports.py`.

- [ ] **Step 6: Commit** — boundary 7 (5 files)

```bash
git add backend/physical_sources/switch1_ingest.py backend/tests/test_physical_switch1_ingest.py backend/tests/physical_support.py backend/tests/test_physical_imports.py backend/physical_sources/platform_policy.py
git commit -m "feat: ingest the Switch 1 registry with bulk IGDB matching" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: `POST /api/physical/refresh-switch1`, status and the store refresh

**Files:**
- Modify: `backend/physical_routes.py`
- Modify: `backend/tests/test_physical_routes.py`
- Modify: `backend/tests/physical_support.py` (`serve_fixtures`)

**Interfaces:**
- Consumes: Task 4's `registry_switch1.list_editions`, `SOURCE`; Task 7's `ingest_switch1`, `release_listed_ignores`, `count_unmatched`; the router's `guarded`, `exclusive`, `finish_run`, `previous_rows_seen`, `count_pending`, `_warning_entry`, `run_out`.
- Produces:
  - `POST /api/physical/refresh-switch1` → `RunOut` (admin; 409 while any catalogue write runs; one `catalogue_runs` row with source `nscollectors_ns1`; retires unlisted rows after a clean, non-short run; errors carry the sheet's warnings, the ingest's errors and one `info` entry "`<m> newly matched, <u> unmatched, <r> left to Resolve`").
  - `SOURCE_NAMES["nscollectors_ns1"] = "Switch 1 registry"`; `REGISTRY_SOURCES = ("nscollectors", "switch2tracker", "nscollectors_ns1")` so status lists it with kind `registry`.
  - `GET /api/physical/status` → `totals.switch1_unmatched: int`.
  - `POST /api/physical/refresh` releases listed automatic ignores before its resolve batch.
  - `physical_support.serve_fixtures` answers the Switch 1 sheet from `registry_switch1/`.

- [ ] **Step 1: Serve the Switch 1 sheet from the fixtures** — in `backend/tests/physical_support.py`, after `DOMAINS = ...` add:

```python
SWITCH_1 = PHYSICAL / "registry_switch1"
SWITCH_1_SHEET = "1FNyvbbU64Pb9lheg28gC_5fMalIYJ0aD763T7M1QqF0"
SWITCH_1_CIAB_GID = 1406641930


def switch_1_fixture(path: str) -> str:
    """The recorded Switch 1 tab a values path asks for, told apart by the
    CIAB tab's recorded title."""
    properties = json.loads((SWITCH_1 / "properties.json").read_text())
    titles = {
        sheet["properties"]["sheetId"]: sheet["properties"]["title"]
        for sheet in properties["sheets"]
    }
    ciab = "'" + titles[SWITCH_1_CIAB_GID].replace("'", "''") + "'"
    return "ciab" if unquote(path).endswith(f"/values/{ciab}") else "master"
```

and in `serve_fixtures`'s handler, directly before `if host == "sheets.googleapis.com":` add:

```python
        if host == "sheets.googleapis.com" and SWITCH_1_SHEET in path:
            assert url.params["key"] == "sheets-key"
            name = (
                "properties"
                if url.params.get("fields") == "sheets.properties"
                else switch_1_fixture(path)
            )
            return httpx2.Response(200, text=(SWITCH_1 / f"{name}.json").read_text())
```

- [ ] **Step 2: Write the failing tests** — in `backend/tests/test_physical_routes.py`:

2a. Imports: add `import json`; change the support import to `from physical_support import PHYSICAL, FakeIgdb, client_for, serve_fixtures`; add `CatalogueMatch`, `MatchConfidence`, `MatchDecision` to the `models` import; add `from physical_sources import registry_switch1` and `from physical_sources.registry import rows_from_values`.

2b. Add `("post", "/api/physical/refresh-switch1"),` to the `test_every_route_needs_the_admin` parameter list.

2c. Append:

```python
# --- Switch 1 registry ----------------------------------------------------------


def _switch_1_editions():
    def tab(name):
        path = PHYSICAL / "registry_switch1" / f"{name}.json"
        return rows_from_values(json.loads(path.read_text()))

    master, _ = registry_switch1.parse_master(tab("master"))
    ciab, _ = registry_switch1.parse_ciab(tab("ciab"))
    return registry_switch1.to_editions(master, ciab)


DEATHS_DOOR = next(
    row["id"]
    for row in json.loads(
        (PHYSICAL / "igdb" / "switch_titles_deaths_door.json").read_text()
    )
    if row["name"] == "Death's Door"
)


async def test_the_switch_1_refresh_writes_decides_and_links(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post("/api/physical/refresh-switch1")
        totals = (await client.get("/api/physical/status")).json()["totals"]
    assert response.status_code == 200
    run = response.json()
    assert (run["source"], run["name"], run["ok"]) == (
        "nscollectors_ns1",
        "Switch 1 registry",
        True,
    )
    assert [error["code"] for error in run["errors"]] == ["info"]
    live = await _count(
        sessionmaker_for_test,
        PhysicalEdition,
        PhysicalEdition.source == "nscollectors_ns1",
        PhysicalEdition.platform_id == 130,
    )
    assert run["rows_seen"] == live == len(_switch_1_editions())
    async with sessionmaker_for_test() as session:
        decision = await session.get(CatalogueMatch, ("death s door", 130))
        linked = set(
            await session.scalars(
                select(PhysicalEdition.igdb_id).where(
                    PhysicalEdition.source == "nscollectors_ns1",
                    PhysicalEdition.title_normalized == "death s door",
                )
            )
        )
        automatic = await session.scalar(
            select(func.count())
            .select_from(CatalogueMatch)
            .where(
                CatalogueMatch.platform_id == 130,
                CatalogueMatch.decided_by == MatchDecision.IGNORED,
                CatalogueMatch.match_confidence == MatchConfidence.UNCERTAIN,
            )
        )
    assert (decision.decided_by, decision.match_confidence, decision.igdb_id) == (
        MatchDecision.AUTO,
        MatchConfidence.EXACT,
        DEATHS_DOOR,
    )
    assert linked == {DEATHS_DOOR}
    assert totals["switch1_unmatched"] == automatic > 0


async def test_a_second_switch_1_refresh_changes_nothing(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        await client.post("/api/physical/refresh-switch1")
        again = (await client.post("/api/physical/refresh-switch1")).json()
    assert (again["ok"], again["rows_changed"], again["rows_retired"]) == (True, 0, 0)


async def test_without_a_sheets_key_the_switch_1_refresh_writes_nothing(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test, sheets_key=None) as client:
        run = (await client.post("/api/physical/refresh-switch1")).json()
    assert run["ok"] is False
    assert [error["code"] for error in run["errors"]] == ["sheets_not_configured"]
    assert await _count(sessionmaker_for_test, PhysicalEdition) == 0


async def test_without_igdb_the_switch_1_refresh_writes_nothing(sessionmaker_for_test):
    igdb = FakeIgdb(configured=False)
    async with client_for(sessionmaker_for_test, igdb=igdb) as client:
        run = (await client.post("/api/physical/refresh-switch1")).json()
    assert (run["ok"], run["rows_seen"]) == (False, 0)
    assert [error["code"] for error in run["errors"]] == ["igdb_not_configured"]
    assert await _count(sessionmaker_for_test, PhysicalEdition) == 0
    assert await _count(sessionmaker_for_test, CatalogueMatch) == 0


async def test_a_switch_1_key_a_store_lists_is_left_to_resolve(sessionmaker_for_test):
    key = next(
        row.title_normalized
        for row in _switch_1_editions()
        if row.title_normalized != "death s door"
    )
    async with sessionmaker_for_test() as session:
        session.add(
            StoreListing(
                store="super_rare",
                store_product_id="s1",
                variant_id="s1",
                handle="s1",
                url="https://example.test/s1",
                region="EUR",
                title=key,
                title_normalized=key,
                platform_id=130,
                platform="Nintendo Switch",
                is_game=True,
                currency="GBP",
                availability="in_stock",
            )
        )
        await session.commit()
    igdb = FakeIgdb(switch_titles=[])
    async with client_for(sessionmaker_for_test, igdb=igdb) as client:
        run = (await client.post("/api/physical/refresh-switch1")).json()
    assert run["ok"] is True and run["unresolved_remaining"] >= 1
    async with sessionmaker_for_test() as session:
        assert await session.get(CatalogueMatch, (key, 130)) is None


async def test_a_switch_1_refresh_during_another_write_is_409(sessionmaker_for_test):
    gate, entered = asyncio.Event(), asyncio.Event()
    handler = serve_fixtures(gate=gate, entered=entered)
    async with client_for(sessionmaker_for_test, handler=handler) as client:
        first = asyncio.create_task(client.post("/api/physical/refresh-switch1"))
        await asyncio.wait_for(entered.wait(), timeout=10)
        second = await client.post("/api/physical/resolve")
        gate.set()
        assert (await first).status_code == 200
    assert second.status_code == 409


async def test_status_lists_the_switch_1_registry(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/physical/status")).json()
    source = next(s for s in body["sources"] if s["source"] == "nscollectors_ns1")
    assert (source["name"], source["kind"], source["last_run"]) == (
        "Switch 1 registry",
        "registry",
        None,
    )
    assert body["totals"]["switch1_unmatched"] == 0


async def test_a_store_refresh_hands_a_hidden_switch_1_title_to_resolve(
    sessionmaker_for_test,
):
    async with sessionmaker_for_test() as session:
        for key, confidence in (
            ("hidden port", MatchConfidence.UNCERTAIN),
            ("kept port", None),
        ):
            session.add(
                StoreListing(
                    store="super_rare",
                    store_product_id=key,
                    variant_id=key,
                    handle=key.replace(" ", "-"),
                    url="https://example.test/x",
                    region="EUR",
                    title=key,
                    title_normalized=key,
                    platform_id=130,
                    platform="Nintendo Switch",
                    is_game=True,
                    currency="GBP",
                    availability="in_stock",
                )
            )
            session.add(
                CatalogueMatch(
                    title_normalized=key,
                    platform_id=130,
                    decided_by=MatchDecision.IGNORED,
                    match_confidence=confidence,
                )
            )
        await session.commit()
    # IGDB off, so the refresh's resolve batch only counts what is open.
    igdb = FakeIgdb(configured=False)
    async with client_for(sessionmaker_for_test, igdb=igdb) as client:
        response = await client.post(
            "/api/physical/refresh", json={"stores": ["nicalis"]}
        )
    assert response.status_code == 200
    async with sessionmaker_for_test() as session:
        assert await session.get(CatalogueMatch, ("hidden port", 130)) is None
        kept = await session.get(CatalogueMatch, ("kept port", 130))
    assert kept.decided_by == MatchDecision.IGNORED
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd backend && ./.venv/bin/pytest tests/test_physical_routes.py`
Expected: FAIL — `/api/physical/refresh-switch1` answers 404 (the admin test gets 404, not 401); status has no `nscollectors_ns1` source; `test_a_store_refresh_hands_...` finds the hidden decision still there.

- [ ] **Step 4: Implement** in `backend/physical_routes.py`:

4a. Imports: add `from physical_sources import registry_switch1 as switch1_sheet` after `from physical_sources import registry as sheet`, and after the `physical_sources.sync` import block:

```python
from physical_sources.switch1_ingest import (
    count_unmatched,
    ingest_switch1,
    release_listed_ignores,
)
```

4b. Constants:

```python
REGISTRY_SOURCES = ("nscollectors", "switch2tracker", "nscollectors_ns1")
SOURCE_NAMES = {
    **{key: config.name for key, config in STORES.items()},
    "nscollectors": "r/NSCollectors registry",
    "switch2tracker": "switch2-tracker",
    "nscollectors_ns1": "Switch 1 registry",
    "igdb_platform": "N64 (IGDB)",
    "resolve": "Resolve",
}
```

4c. Module docstring: append

```python
The Switch 1 registry is its own press (refresh-switch1): the sheet, then
IGDB's Switch list for bulk matching, both read before anything is written.
A store refresh hands back to Resolve any Switch 1 title the matcher hid
that a store now sells.
```

4d. In `refresh` (the stores route), replace `outcome = await resolve_run(session)` with:

```python
        # A Switch 1 title the registry's matcher hid and a store now sells
        # goes back to Resolve (switch1_ingest).
        await release_listed_ignores(session)
        await session.commit()
        outcome = await resolve_run(session)
```

4e. After `refresh_platform`, add:

```python
    @router.post("/refresh-switch1", response_model=RunOut)
    async def refresh_switch1(
        _lock=Depends(exclusive),
        session: AsyncSession = Depends(get_session),
    ) -> RunOut:
        """The Switch 1 registry: the sheet, bulk-matched to IGDB's Switch
        list by name, then snapshots for what matched. IGDB is still never a
        physical source for Switch 1: refresh-platform refuses 130."""
        previous = await previous_rows_seen(session, switch1_sheet.SOURCE)
        throttle = HostThrottle()
        async with http_client_factory() as client:

            async def work(run):
                try:
                    rows, warnings = await switch1_sheet.list_editions(
                        client, sheets_key, throttle
                    )
                except PhysicalSourceError as error:
                    await finish_run(session, run, ok=False, errors=[error.as_entry()])
                    await session.commit()
                    return
                outcome = await ingest_switch1(
                    session, igdb(), rows, previous=previous
                )
                errors = [_warning_entry(w) for w in warnings] + outcome.errors
                if not outcome.fatal:
                    errors.append(
                        {
                            "code": "info",
                            "detail": f"{outcome.matched} newly matched, "
                            f"{outcome.unmatched} unmatched, "
                            f"{outcome.left_to_resolve} left to Resolve",
                        }
                        if outcome.rows
                        else {"code": "empty", "detail": "no rows"}
                    )
                await finish_run(
                    session,
                    run,
                    ok=outcome.rows > 0 and not outcome.fatal,
                    rows_seen=outcome.rows,
                    rows_changed=outcome.changed,
                    rows_retired=outcome.retired,
                    unresolved_remaining=await count_pending(session),
                    short_run=outcome.short,
                    errors=errors,
                )
                await session.commit()

            snapshot, _, _ = await guarded(session, switch1_sheet.SOURCE, work)
        return snapshot
```

4f. In `status`, after the `totals["disagreements"]` line add:

```python
        # Registry titles IGDB's Switch list could not name: hidden on purpose.
        totals["switch1_unmatched"] = await count_unmatched(session)
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd backend && ./.venv/bin/pytest tests/test_physical_routes.py` → all pass, `test_switch_1_is_never_ingested` among them, unedited. Then the whole suite: `./.venv/bin/pytest` → green (`test_public.py` and `test_public_outputs.py` unchanged and passing).
Then `./.venv/bin/ruff format physical_routes.py tests/test_physical_routes.py tests/physical_support.py && ./.venv/bin/ruff check physical_routes.py tests/test_physical_routes.py tests/physical_support.py`.

- [ ] **Step 6: Commit** — boundary 8 (3 files)

```bash
git add backend/physical_routes.py backend/tests/test_physical_routes.py backend/tests/physical_support.py
git commit -m "feat: add the Switch 1 registry refresh route" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: `/admin/catalogue` — Refresh Switch 1 and the unmatched line — **parallel-safe** with Task 10

**Files:**
- Modify: `frontend/src/pages/AdminCatalogue.jsx`
- Modify: `frontend/src/pages/AdminCatalogue.test.jsx`

**Interfaces:**
- Consumes: `POST /api/physical/refresh-switch1` → `RunOut`; `GET /api/physical/status` → `totals.switch1_unmatched` (Task 8). The new source appears in the existing table by itself (kind `registry`, name "Switch 1 registry").
- Produces: named export `unmatchedWords(count: number): string`; a "Refresh Switch 1" button after "Refresh N64"; the line "`N` Switch 1 titles unmatched" under the totals when `N > 0`.

- [ ] **Step 1: Write the failing tests** — in `frontend/src/pages/AdminCatalogue.test.jsx` change the import to `import AdminCatalogue, { runState, unmatchedWords } from './AdminCatalogue.jsx'` and append:

```jsx
describe('Switch 1 registry', () => {
  it('words the unmatched count', () => {
    expect(unmatchedWords(1)).toBe('1 Switch 1 title unmatched')
    expect(unmatchedWords(688)).toBe('688 Switch 1 titles unmatched')
  })

  it('refreshes Switch 1 through its route and counts what stayed unmatched', async () => {
    const calls = stubApi({
      'GET /api/physical/status': () =>
        json({ ...STATUS, totals: { ...STATUS.totals, switch1_unmatched: 688 } }),
      'POST /api/physical/refresh-switch1': () =>
        json(run('nscollectors_ns1', { rows_seen: 4210 })),
    })
    renderPage()
    expect(
      await screen.findByText('688 Switch 1 titles unmatched'),
    ).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Refresh Switch 1' }),
    )
    expect(
      await screen.findByText('Switch 1: 4210 editions'),
    ).toBeInTheDocument()
    expect(calls.map((call) => call.path)).toContain(
      '/api/physical/refresh-switch1',
    )
  })

  it('says nothing about unmatched titles when there are none', async () => {
    stubApi()
    renderPage()
    await screen.findByRole('table', { name: 'Sources' })
    expect(screen.queryByText(/Switch 1 titles? unmatched/)).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npm test -- src/pages/AdminCatalogue.test.jsx`
Expected: FAIL — `unmatchedWords is not a function`; no "Refresh Switch 1" button.

- [ ] **Step 3: Implement** in `frontend/src/pages/AdminCatalogue.jsx`:

3a. After `runState`, add:

```jsx
/** The Switch 1 registry titles IGDB could not name, in words. */
export function unmatchedWords(count) {
  return `${count} Switch 1 ${count === 1 ? 'title' : 'titles'} unmatched`
}
```

3b. After `refreshN64`, add:

```jsx
  async function refreshSwitch1() {
    const run = await press(
      'Refreshing Switch 1…',
      '/api/physical/refresh-switch1',
    )
    if (run) setMessage(`Switch 1: ${run.rows_seen} editions`)
  }
```

3c. In `.catalogue-actions`, after the Refresh N64 button:

```jsx
        <button type="button" disabled={busy} onClick={refreshSwitch1}>
          Refresh Switch 1
        </button>
```

3d. Directly after the closing `</dl>` of `.catalogue-totals`:

```jsx
          {status.totals.switch1_unmatched > 0 && (
            <p className="muted">
              {unmatchedWords(status.totals.switch1_unmatched)}
            </p>
          )}
```

3e. The intro paragraph becomes:

```jsx
      <p className="muted">
        What exists physically, and as what: the r/NSCollectors registries for
        Switch 2 and Switch 1, the boutique stores and IGDB&apos;s N64 list.
      </p>
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npm test -- src/pages/AdminCatalogue.test.jsx` → all pass. Then `npx prettier --write src/pages/AdminCatalogue.jsx src/pages/AdminCatalogue.test.jsx && npx eslint src/pages/AdminCatalogue.jsx src/pages/AdminCatalogue.test.jsx`.

- [ ] **Step 5: Commit** — boundary 9 (2 files)

```bash
git add frontend/src/pages/AdminCatalogue.jsx frontend/src/pages/AdminCatalogue.test.jsx
git commit -m "feat: refresh the Switch 1 registry from the catalogue page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: The store list page — **parallel-safe** with Task 9

**Files:**
- Create: `frontend/src/pages/AdminStoreList.jsx`
- Create: `frontend/src/pages/AdminStoreList.test.jsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `GET /api/recommendations?kind=discover` → `{ picks: Row[] }`, `GET /api/recommendations?kind=radar` → `{ sections: { suggested: Row[], dated_later: Row[], digital: Row[] } }`, where `Row` is `_row_out` (`id, title, platform, physical_format, release_date, reasons, score, format_note, lane, …`); `POST /api/recommendations/{id}/own` → 201 `{ item_id }`, 409 `{ detail }` when already answered or on the shelf; `apiFetch`, `errorMessage`, `usePageTitle`.
- Produces: default export `AdminStoreList`; named exports `PREORDER_DAYS = 90`, `SECTIONS`, `isoDay(date): string`, `addDays(date, days): Date`, `radarSection(row, today): 'switch2' | 'switch' | 'preorder' | 'skip' | null`, `buildList(discover, radar, today): Record<sectionKey, Row[]>`.

Section rules (spec E plus decision 9): Top picks are Discover's pending
picks by score; a Radar full cartridge dated on or before today goes under
its console; one dated within 90 days after today is Ask about pre-orders
(soonest first); a Radar Game-Key Card, code in a box or digital-only row is
Skip in store; anything else is left off. A game shows once.

- [ ] **Step 1: Write the failing tests** — create `frontend/src/pages/AdminStoreList.test.jsx`:

```jsx
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminStoreList, {
  addDays,
  buildList,
  isoDay,
  radarSection,
} from './AdminStoreList.jsx'

const TODAY = new Date(2026, 9, 4) // 4 October 2026, local time

function row(id, fields = {}) {
  return {
    id,
    title: `Game ${id}`,
    platform: 'Nintendo Switch 2',
    physical_format: 'game_card',
    release_date: '2026-09-01',
    reasons: [`Reason ${id}`],
    score: 50,
    format_note: null,
    lane: 'dated',
    ...fields,
  }
}

describe('radarSection', () => {
  it('puts a released cartridge under its console', () => {
    expect(radarSection(row('a'), TODAY)).toBe('switch2')
    expect(
      radarSection(row('b', { platform: 'Nintendo Switch' }), TODAY),
    ).toBe('switch')
    expect(radarSection(row('c', { release_date: '2026-10-04' }), TODAY)).toBe(
      'switch2',
    )
  })

  it('asks about cartridges due within 90 days and leaves later ones off', () => {
    expect(radarSection(row('a', { release_date: '2026-10-05' }), TODAY)).toBe(
      'preorder',
    )
    expect(radarSection(row('b', { release_date: '2027-01-02' }), TODAY)).toBe(
      'preorder',
    )
    expect(
      radarSection(row('c', { release_date: '2027-01-03' }), TODAY),
    ).toBeNull()
    expect(radarSection(row('d', { release_date: null }), TODAY)).toBeNull()
  })

  it('sends key cards, codes in a box and digital-only games to Skip', () => {
    expect(
      radarSection(row('a', { physical_format: 'game_key_card' }), TODAY),
    ).toBe('skip')
    expect(
      radarSection(row('b', { physical_format: 'code_in_box' }), TODAY),
    ).toBe('skip')
    expect(
      radarSection(row('c', { physical_format: null, lane: 'digital' }), TODAY),
    ).toBe('skip')
  })

  it('leaves off a physical game whose format is unknown', () => {
    expect(radarSection(row('a', { physical_format: null }), TODAY)).toBeNull()
  })
})

describe('buildList', () => {
  it('orders Top picks by score and shows each game once', () => {
    const discover = {
      picks: [row('d1', { score: 40 }), row('d2', { score: 90 })],
    }
    const radar = {
      sections: {
        suggested: [row('r1', { title: 'Game d1' })],
        dated_later: [],
        digital: [],
      },
    }
    const list = buildList(discover, radar, TODAY)
    expect(list.top.map((entry) => entry.id)).toEqual(['d2', 'd1'])
    expect(list.switch2).toEqual([])
  })

  it('orders pre-orders soonest first', () => {
    const radar = {
      sections: {
        suggested: [
          row('late', { release_date: '2026-12-01', score: 90 }),
          row('soon', { release_date: '2026-10-10', score: 10 }),
        ],
        dated_later: [],
        digital: [],
      },
    }
    expect(
      buildList({ picks: [] }, radar, TODAY).preorder.map((entry) => entry.id),
    ).toEqual(['soon', 'late'])
  })
})

const PAST = isoDay(addDays(new Date(), -30))
const SOON = isoDay(addDays(new Date(), 10))

const DISCOVER = {
  picks: [
    row('d1', {
      title: 'Omori',
      platform: 'Nintendo Switch',
      reasons: ['Because you rated Hades 10'],
      score: 80,
      lane: null,
    }),
  ],
}

const RADAR = {
  sections: {
    suggested: [
      row('r1', { title: 'Out Now Two', release_date: PAST, score: 70 }),
      row('r2', {
        title: 'Soon Cart',
        release_date: SOON,
        lane: 'preorder',
        reasons: ['Pre-order closes soon'],
      }),
    ],
    dated_later: [
      row('r3', {
        title: 'Old Cart',
        platform: 'Nintendo Switch',
        release_date: PAST,
      }),
      row('r4', {
        title: 'Key Card Game',
        physical_format: 'game_key_card',
        release_date: PAST,
        reasons: [],
        format_note: 'Full game on cartridge in EUR — Super Rare',
      }),
    ],
    digital: [
      row('r5', {
        title: 'Digital Only',
        physical_format: null,
        lane: 'digital',
        release_date: SOON,
      }),
    ],
  },
}

function json(body, status = 200) {
  return { ok: status < 300, status, json: async () => body }
}

/** Answers by method and path (query included); `handlers` override. */
function stubApi(handlers = {}) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      const path = String(url).replace(/^.*\/api/, '/api')
      const method = options.method ?? 'GET'
      calls.push({ method, path })
      const handler = handlers[`${method} ${path}`]
      if (handler) return handler(options)
      if (path === '/api/recommendations?kind=discover') return json(DISCOVER)
      if (path === '/api/recommendations?kind=radar') return json(RADAR)
      return json({}, 404)
    }),
  )
  return calls
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/store-list']}>
      <Routes>
        <Route element={<Outlet context={{ signedIn: true }} />}>
          <Route path="admin/store-list" element={<AdminStoreList />} />
          <Route path="admin" element={<p>Admin home</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AdminStoreList', () => {
  it('shows the five sections in order under the Game-Key Card note', async () => {
    stubApi()
    renderPage()
    const top = await screen.findByRole('region', { name: 'Top picks' })
    expect(
      screen.getByText('On Switch 2 boxes, put back Game-Key Cards.'),
    ).toBeInTheDocument()
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      'Top picks',
      'Out now on Switch 2',
      'Out now on Switch',
      'Ask about pre-orders',
      'Skip in store',
    ])
    expect(within(top).getByText('Omori')).toBeInTheDocument()
    expect(
      within(top).getByText('Nintendo Switch · Full game on cartridge'),
    ).toBeInTheDocument()
    expect(
      within(top).getByText('Because you rated Hades 10'),
    ).toBeInTheDocument()
    const region = (name) => screen.getByRole('region', { name })
    expect(
      within(region('Out now on Switch 2')).getByText('Out Now Two'),
    ).toBeInTheDocument()
    expect(
      within(region('Out now on Switch')).getByText('Old Cart'),
    ).toBeInTheDocument()
    expect(
      within(region('Ask about pre-orders')).getByText(
        `Nintendo Switch 2 · Full game on cartridge · Out ${SOON}`,
      ),
    ).toBeInTheDocument()
    const skip = region('Skip in store')
    expect(within(skip).getByText('Key Card Game')).toBeInTheDocument()
    expect(
      within(skip).getByText('Full game on cartridge in EUR — Super Rare'),
    ).toBeInTheDocument()
    expect(
      within(skip).getByText('Nintendo Switch 2 · Digital only'),
    ).toBeInTheDocument()
    expect(document.title).toBe('Store list · Admin')
  })

  it('drops a row as soon as Got it is pressed and marks the game owned', async () => {
    let answer
    const calls = stubApi({
      'POST /api/recommendations/d1/own': () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Got it: Omori' }),
    )
    expect(screen.queryByText('Omori')).toBeNull()
    answer(json({ item_id: 'x' }, 201))
    expect(
      await screen.findByText('Added Omori to the collection'),
    ).toBeInTheDocument()
    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/recommendations/d1/own',
    })
  })

  it('brings the row back and says why when Got it fails', async () => {
    stubApi({
      'POST /api/recommendations/d1/own': () =>
        json({ detail: 'Database unavailable' }, 500),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Got it: Omori' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Database unavailable',
    )
    expect(screen.getByText('Omori')).toBeInTheDocument()
  })

  it('keeps an already-answered game off the list and names it', async () => {
    stubApi({
      'POST /api/recommendations/d1/own': () =>
        json({ detail: 'Already on your shelf' }, 409),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Got it: Omori' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Omori: Already on your shelf',
    )
    expect(screen.queryByText('Omori')).toBeNull()
  })

  it('points at Discover and Radar when there is nothing to show', async () => {
    stubApi({
      'GET /api/recommendations?kind=discover': () => json({ picks: [] }),
      'GET /api/recommendations?kind=radar': () =>
        json({ sections: { suggested: [], dated_later: [], digital: [] } }),
    })
    renderPage()
    expect(
      await screen.findByRole('link', { name: 'Discover' }),
    ).toHaveAttribute('href', '/admin/discover')
    expect(screen.getByRole('link', { name: 'Radar' })).toHaveAttribute(
      'href',
      '/admin/radar',
    )
  })

  it('asks for a sign-in when the API says 401', async () => {
    stubApi({
      'GET /api/recommendations?kind=discover': () => json({}, 401),
    })
    renderPage()
    expect(
      await screen.findByRole('link', { name: 'Sign in' }),
    ).toHaveAttribute('href', '/admin')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npm test -- src/pages/AdminStoreList.test.jsx`
Expected: FAIL — cannot resolve `./AdminStoreList.jsx`.

- [ ] **Step 3: Implement** — create `frontend/src/pages/AdminStoreList.jsx`:

```jsx
import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import { apiFetch, errorMessage } from '../lib/api.js'
import { usePageTitle } from '../lib/usePageTitle.js'

const UNREACHABLE = 'Could not reach the API. Try again shortly.'

/** How far ahead a dated cartridge is worth asking a store about. */
export const PREORDER_DAYS = 90

/** [key, heading], in the order a store visit reads them. */
export const SECTIONS = [
  ['top', 'Top picks'],
  ['switch2', 'Out now on Switch 2'],
  ['switch', 'Out now on Switch'],
  ['preorder', 'Ask about pre-orders'],
  ['skip', 'Skip in store'],
]

// Mirrors PLATFORM_WORDS in backend/radar.py, which names each row's platform.
const CONSOLES = {
  'Nintendo Switch 2': 'switch2',
  'Nintendo Switch': 'switch',
}
const SKIP_FORMATS = new Set(['game_key_card', 'code_in_box'])
// Mirrors FORMAT_WORDS in backend/physical_sources/limits.py, as a line starts.
const FORMAT_WORDS = {
  game_card: 'Full game on cartridge',
  game_key_card: 'Game-Key Card',
  code_in_box: 'Code in a box',
  disc: 'Disc',
}

/** A local date as YYYY-MM-DD, the shape the API's dates come in. */
export function isoDay(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** `date` moved by `days` calendar days. */
export function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/**
 * Where a Radar row goes on the store list, or null when it is not on it:
 * anything that is not a full cartridge is Skip; a cartridge out by today is
 * under its console; one due within PREORDER_DAYS is worth asking about.
 */
export function radarSection(row, today) {
  if (row.lane === 'digital' || SKIP_FORMATS.has(row.physical_format))
    return 'skip'
  if (row.physical_format !== 'game_card' || !row.release_date) return null
  if (row.release_date <= isoDay(today)) return CONSOLES[row.platform] ?? null
  return row.release_date <= isoDay(addDays(today, PREORDER_DAYS))
    ? 'preorder'
    : null
}

/** Discover's picks and Radar's rows as the store list's sections. */
export function buildList(discover, radar, today) {
  const sections = Object.fromEntries(SECTIONS.map(([key]) => [key, []]))
  const seen = new Set()
  function add(key, entry) {
    const game = `${entry.title}|${entry.platform}`
    if (seen.has(game)) return
    seen.add(game)
    sections[key].push(entry)
  }
  const byScore = (a, b) => b.score - a.score
  for (const pick of [...(discover?.picks ?? [])].sort(byScore))
    add('top', pick)
  const rows = Object.values(radar?.sections ?? {}).flat()
  for (const entry of rows.sort(byScore)) {
    const key = radarSection(entry, today)
    if (key) add(key, entry)
  }
  sections.preorder.sort((a, b) => a.release_date.localeCompare(b.release_date))
  return sections
}

async function fetchLists() {
  try {
    const [discover, radar] = await Promise.all([
      apiFetch('/api/recommendations?kind=discover'),
      apiFetch('/api/recommendations?kind=radar'),
    ])
    if (discover.status === 401 || radar.status === 401)
      return { state: 'unauthorized' }
    if (!discover.ok)
      return { state: 'error', error: await errorMessage(discover) }
    if (!radar.ok) return { state: 'error', error: await errorMessage(radar) }
    return {
      state: 'ready',
      discover: await discover.json(),
      radar: await radar.json(),
    }
  } catch {
    return { state: 'error', error: UNREACHABLE }
  }
}

function meta(entry, key) {
  const format =
    entry.lane === 'digital'
      ? 'Digital only'
      : (FORMAT_WORDS[entry.physical_format] ?? 'Format unknown')
  const parts = [entry.platform, format]
  if (key === 'preorder' && entry.release_date)
    parts.push(`Out ${entry.release_date}`)
  return parts.filter(Boolean).join(' · ')
}

/**
 * What to look for in a store, read from the pending Discover picks and Radar
 * rows: one column, large tap targets, nothing on hover, for a phone held in
 * an aisle. Got it is Discover's Already own: the game becomes a private
 * owned item and leaves both lists. The row goes at once and comes back if
 * the server refuses.
 */
export default function AdminStoreList() {
  usePageTitle('Store list · Admin')
  const { signedIn = false } = useOutletContext() ?? {}
  const [state, setState] = useState('loading')
  const [sections, setSections] = useState(null)
  const [hidden, setHidden] = useState(() => new Set())
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const apply = useCallback((result) => {
    setState(result.state)
    if (result.state === 'ready')
      setSections(buildList(result.discover, result.radar, new Date()))
    if (result.error) setError(result.error)
  }, [])

  useEffect(() => {
    let live = true
    fetchLists().then((result) => {
      if (live) apply(result)
    })
    return () => {
      live = false
    }
  }, [apply, signedIn])

  function show(id, shown) {
    setHidden((current) => {
      const next = new Set(current)
      if (shown) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function gotIt(entry) {
    setError(null)
    setMessage(null)
    show(entry.id, false)
    try {
      const response = await apiFetch(`/api/recommendations/${entry.id}/own`, {
        method: 'POST',
      })
      if (response.status === 409) {
        // errorMessage words every 409 as a running refresh; here it is the
        // suggestion's own answer ("Already on your shelf"), so it stays off.
        const body = await response.json().catch(() => ({}))
        setError(`${entry.title}: ${body.detail ?? 'already answered'}`)
        return
      }
      if (!response.ok) {
        show(entry.id, true)
        setError(await errorMessage(response))
        return
      }
      setMessage(`Added ${entry.title} to the collection`)
    } catch {
      show(entry.id, true)
      setError(UNREACHABLE)
    }
  }

  if (state === 'unauthorized') {
    return (
      <section>
        <h1>Store list</h1>
        <p>
          <Link to="/admin">Sign in</Link> to see the store list.
        </p>
      </section>
    )
  }

  const empty =
    sections && SECTIONS.every(([key]) => sections[key].length === 0)

  return (
    <section className="store-list">
      <h1>Store list</h1>
      <p className="store-list-note">
        On Switch 2 boxes, put back Game-Key Cards.
      </p>
      <p className="catalogue-progress" role="status" aria-live="polite">
        {message ?? ''}
      </p>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {state === 'loading' && <p className="muted">Loading the list…</p>}
      {empty && (
        <p className="muted">
          Nothing to look for yet: generate{' '}
          <Link to="/admin/discover">Discover</Link> and{' '}
          <Link to="/admin/radar">Radar</Link> first.
        </p>
      )}
      {sections &&
        SECTIONS.map(([key, heading]) => {
          const rows = sections[key].filter((entry) => !hidden.has(entry.id))
          return (
            <section
              key={key}
              className="store-list-section"
              aria-labelledby={`store-list-${key}`}
            >
              <h2 id={`store-list-${key}`}>{heading}</h2>
              {rows.length === 0 ? (
                <p className="muted">Nothing here.</p>
              ) : (
                <ul className="store-list-rows">
                  {rows.map((entry) => {
                    const reason = entry.reasons?.[0] ?? entry.format_note
                    return (
                      <li key={entry.id} className="store-list-row">
                        <div className="store-list-text">
                          <strong>{entry.title}</strong>
                          <span className="muted">{meta(entry, key)}</span>
                          {reason && <span>{reason}</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => gotIt(entry)}
                          aria-label={`Got it: ${entry.title}`}
                        >
                          Got it
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
    </section>
  )
}
```

Append to `frontend/src/index.css`:

```css
/* Store list: read on a phone in a store. One column at every width, tap
   targets of at least 44px, and nothing that needs a hover. */
.store-list-note {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  margin: 1rem 0;
  padding: 0.75rem 1rem;
}

.store-list-section {
  margin-top: 1.5rem;
}

.store-list-rows {
  display: grid;
  gap: 0.5rem;
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
}

.store-list-row {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  gap: 0.75rem;
  justify-content: space-between;
  padding: 0.75rem;
}

.store-list-text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
  overflow-wrap: anywhere;
}

.store-list-row button {
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  cursor: pointer;
  flex: none;
  font: inherit;
  min-height: 44px;
  min-width: 44px;
  padding: 0.5rem 1rem;
}

.store-list-row button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npm test -- src/pages/AdminStoreList.test.jsx` → all pass. Then `npx prettier --write src/pages/AdminStoreList.jsx src/pages/AdminStoreList.test.jsx src/index.css && npx eslint src/pages/AdminStoreList.jsx src/pages/AdminStoreList.test.jsx`.

- [ ] **Step 5: Commit** — boundary 10 (3 files)

```bash
git add frontend/src/pages/AdminStoreList.jsx frontend/src/pages/AdminStoreList.test.jsx frontend/src/index.css
git commit -m "feat: add the phone-first store list page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: Route, title row and admin link

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/App.test.jsx`
- Modify: `frontend/src/pages/Admin.jsx`
- Modify: `frontend/src/pages/Admin.test.jsx`

**Interfaces:**
- Consumes: Task 10's default export.
- Produces: route `admin/store-list` → `AdminStoreList`; a "Store list" link on `/admin`. Not added to `WIDE_ROUTES`: the page is a single column by design.

The route-title guard in `App.test.jsx` derives its count from `App.jsx`'s
`<Route` lines, so the route and its `TITLES` row land in one commit.

- [ ] **Step 1: Write the failing tests**
  - `frontend/src/App.test.jsx`: in `TITLES`, after `['/admin/discover', 'Discover · Admin'],` add `['/admin/store-list', 'Store list · Admin'],`.
  - `frontend/src/pages/Admin.test.jsx`: in `links every admin page, the catalogue included`, after the Play Next assertion add:

```jsx
    expect(screen.getByRole('link', { name: 'Store list' })).toHaveAttribute(
      'href',
      '/admin/store-list',
    )
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npm test -- src/App.test.jsx src/pages/Admin.test.jsx`
Expected: FAIL — `titles /admin/store-list` gets `Not found · Joey Haas`; `covers every titled route` finds 17 `TITLES` rows for 16 titled routes; no "Store list" link.

- [ ] **Step 3: Implement**
  - `frontend/src/App.jsx`: after `import AdminRadar from './pages/AdminRadar.jsx'` add `import AdminStoreList from './pages/AdminStoreList.jsx'`; after `<Route path="admin/discover" element={<AdminDiscover />} />` add `<Route path="admin/store-list" element={<AdminStoreList />} />`.
  - `frontend/src/pages/Admin.jsx`: after the Discover link paragraph add:

```jsx
          <p>
            <Link to="/admin/store-list">Store list</Link>
          </p>
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npm test` → whole suite green. Then `npx prettier --write src/App.jsx src/App.test.jsx src/pages/Admin.jsx src/pages/Admin.test.jsx && npx eslint src/App.jsx src/App.test.jsx src/pages/Admin.jsx src/pages/Admin.test.jsx`, and `npm run build` succeeds.

- [ ] **Step 5: Commit** — boundary 11 (4 files)

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx frontend/src/pages/Admin.jsx frontend/src/pages/Admin.test.jsx
git commit -m "feat: route and link the store list" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Smoke checks — **parallel-safe**

**Files:**
- Modify: `scripts/smoke.sh`

**Interfaces:**
- Produces: two checks, `POST /api/physical/refresh-switch1 unauthenticated` → `401` and `GET /admin/store-list (deep link)` → `200`.

- [ ] **Step 1: Add the API check** after the `GET /api/physical/status unauthenticated` check:

```bash
check_equals "POST /api/physical/refresh-switch1 unauthenticated" \
  "$(curl -s -o /dev/null -m 90 -w '%{http_code}' -X POST "$API_URL/api/physical/refresh-switch1")" \
  "401"
```

- [ ] **Step 2: Add the deep link** after `GET /admin/discover (deep link)`:

```bash
check_equals "GET /admin/store-list (deep link)" "$(http_status "$SITE_URL/admin/store-list")" "200"
```

- [ ] **Step 3: Verify** — `bash -n scripts/smoke.sh` (no output, exit 0); `grep -c "refresh-switch1\|admin/store-list" scripts/smoke.sh` → `3` (the refresh check spans two lines). The script is not run against production here: those routes do not exist until Joey deploys.

- [ ] **Step 4: Commit** — boundary 12 (1 file)

```bash
git add scripts/smoke.sh
git commit -m "test: smoke-check the Switch 1 refresh and the store list" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: Docs

**Files:**
- Modify: `backend/physical_sources/README.md`
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: `backend/physical_sources/README.md`**
  - Intro: "the r/NSCollectors Switch 2 registry, `switch2-tracker` as a cross-check" → "the r/NSCollectors Switch 2 registry and its Switch 1 sheet, `switch2-tracker` as a cross-check".
  - Modules table, after the `registry.py` row:

```markdown
| `registry_switch1.py` | the Switch 1 sheet's Master and code-in-a-box tabs, through `registry.py`'s helpers | yes (three GETs) |
| `switch1_titles.py` | bulk matching of Switch 1 keys to IGDB's Switch list, by name and year | yes |
```

  and after the `platform_policy.py` row:

```markdown
| `switch1_ingest.py` | the Switch 1 refresh: IGDB's title list, editions, decisions, snapshots | database |
```

  - Under **The sources**, after the `switch2-tracker` paragraph, add:

```markdown
**Switch 1 registry** — the r/NSCollectors "Switch Physical Releases" sheet
(`1FNyvbbU64Pb9lheg28gC_5fMalIYJ0aD763T7M1QqF0`), two tabs by gid: Physical
Release Master `2004832329` and CIAB `1406641930`, recorded whole under
`tests/fixtures/physical/registry_switch1/`. Source `nscollectors_ns1`,
platform 130. A Master row with a Switch 1 cart ID (`LA-H-XXXXX-RRR`,
`SWITCH_1_CART_ID_PATTERN`) is a `game_card` at the `registry` tier; one
without is physical with no format. A CIAB row marked "CIAB only? = Yes" is a
`code_in_box`; "No" adds nothing. Every Switch 1 cartridge counts as the full
game: no source flags the rare download-required ones. An edition is keyed by
title, region, publisher, tab and edition info.

`refresh-switch1` reads the sheet, then pages IGDB's Switch list by name only
(`switch1_titles.page_query`, about thirty requests), both before anything is
written. Each key is matched locally against names and alternative names,
exact first and through `game_title` second: one game is AUTO/EXACT, several
are told apart by the sheet's earliest year (within one year), and anything
else is IGNORED with `match_confidence` UNCERTAIN, which marks an automatic
ignore (a human's has none). Those never enter Needs match; the catalogue
page counts them ("N Switch 1 titles unmatched") and lists none. The one
exception is a key a live Switch 1 store listing carries: it is left to
Resolve, here and after every store refresh (`release_listed_ignores`), so a
store's game is never hidden by the sheet's spelling. Only automatic ignores
are reconsidered, on every Switch 1 refresh. Matched games get snapshots
through `fill_games`; `propagate` links the editions, so it needs no
protection for this source. Switch 1 keys are not in
`test_physical_keys.py`'s corpus.
```

  - **N64** paragraph: "Switch 1 is cartridge-only too, but is never ingested: its candidates come only from the stores." → "Switch 1 is cartridge-only too, but is never ingested from IGDB, which cannot tell a physical Switch game from a digital one: its candidates come from the stores and the Switch 1 registry."
  - **Formats**, end of the `collapse.py` paragraph, add: "Switch 1 is region-free (`REGION_FREE_PLATFORMS`): it has no Game-Key Card and no region lock, so a cartridge in any region makes the game a cartridge. Its sheet dates are not registry dates, so nothing from it can reach `/api/public/radar`."

- [ ] **Step 2: `CLAUDE.md`**
  - Media tracker, after the "**The registry writes formats in exactly one way:**" bullet, add:

```markdown
- **The Switch 1 registry** is the r/NSCollectors "Switch Physical
  Releases" sheet, read by `physical_sources/registry_switch1.py` into
  `nscollectors_ns1` editions on platform 130 and bulk-matched by
  `switch1_ingest.py` against IGDB's Switch list paged by name
  (`switch1_titles.py`, pure). One exact match is AUTO/EXACT; anything else
  is IGNORED with `match_confidence` UNCERTAIN (the automatic-ignore marker:
  only the matcher and `release_listed_ignores` revisit those), unless a
  live Switch 1 store listing carries the key, which is left to Resolve.
  IGDB is still never a physical source for Switch 1 (`refresh-platform`
  refuses 130). Switch 1 collapses region-free (`REGION_FREE_PLATFORMS`).
  Its dates are never registry dates (`collapse.REGISTRY_SOURCES` leaves it
  out), so nothing from it can reach `/api/public/radar`. No migration:
  after deploy, press Refresh Switch 1 once on `/admin/catalogue`.
- **The store list** (`/admin/store-list`) is frontend over the pending
  Discover and Radar rows, phone first; Got it is Already own
  (`POST /api/recommendations/{id}/own`).
```

  - Current state / TODO, after the Spine entry (or the last `[x]` entry), add:

```markdown
- [x] Switch 1 catalogue and store list — the Switch 1 registry
      (`refresh-switch1`: about 4,200 titles bulk-matched to IGDB, the
      unmatched hidden), region-free Switch 1 cartridges, and
      `/admin/store-list`. No migration. Spec and plan:
      `docs/planning/2026-10-04-switch1-catalogue-*`
```

- [ ] **Step 3: `README.md`**
  - Routes table: the `/admin/catalogue` row's notes become "What exists physically: registries (Switch 2 and Switch 1), stores, N64"; after the `/admin/discover` row add:

```markdown
| `/admin/store-list` | Store list | What to look for in a store, on a phone: Discover's top picks, Radar cartridges out now on each console, pre-orders to ask about within 90 days, and what to skip; Got it marks a game owned |
```

  - Features table, "Physical catalogue" row: after "the r/NSCollectors registry (via the Sheets API)," insert "its Switch 1 sheet (about 4,200 titles, bulk-matched to IGDB's Switch list),".

- [ ] **Step 4: Format check** — `cd frontend && npx prettier --check ../CLAUDE.md ../README.md ../backend/physical_sources/README.md` (fix with `--write` if needed).

- [ ] **Step 5: Commit** — boundary 13 (3 files)

```bash
git add backend/physical_sources/README.md CLAUDE.md README.md
git commit -m "docs: document the Switch 1 registry and the store list" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## CHECKPOINT — Zone 1 batch review + finish gate

Batch Review Protocol: record the zone-start SHA when Task 1 begins;
`git log --oneline <zone-start>..HEAD` with files, diffstat and a one-line
rationale per commit (13 commits); the Task 2 drift report (header, regions,
cart-ID and date shapes, Death's Door rows, download notes, fixture sizes);
the self code review checklist (plan alignment, standards, commit
granularity, tests, no dead code). Then the finish gate: backend
`./.venv/bin/pytest`, `./.venv/bin/ruff format --check .`,
`./.venv/bin/ruff check .`; frontend `npm test`, `npm run lint`,
`npm run format:check`, `npm run build`. The branch diff touches 4+ files, so
**ultra review** (parallel reviewers per dimension, every finding
adversarially verified). Confirmed findings are fixed in boundary commits.
Exit state: clean review, drafted PR description, zone-exit file written if
the notifier hook is installed. **Stop for Joey**, who pushes, merges and
deploys.

## Zone 2 — owner actions (deploy path and data)

No agent task runs here. Everything below is Joey's, after the checkpoint:

1. Merge and let Render deploy both services. No migration to apply first.
2. Before the first refresh, measure Neon usage (spec Open questions):
   `SELECT pg_size_pretty(pg_database_size(current_database()));` in the
   Neon console. A few thousand more `catalogue_games` snapshots at a few KB
   each should fit the free plan.
3. The first production **Refresh Switch 1** on `/admin/catalogue`. This is a
   data operation against production and an owner action, not a plan task.
4. A Discover **Generate** on `/admin/discover`.

## Zones

```
Zone 1 (auto): tasks 1–13
CHECKPOINT — batch review + finish gate (PR-ready)
Zone 2 (owner, deploy path + production data): merge/deploy, measure Neon, first Refresh Switch 1, Discover generate — no agent tasks
CHECKPOINT — automated environment tests (smoke + owner checks below)
```

Task 2 calls the Sheets API and IGDB through the repo's own recorder to write
test fixtures; it changes no production data and nothing in the deploy path,
so it stays in Zone 1 behind its own STOP gates. No infra, CI, `render.yaml`
or migration change anywhere in the plan.

## Automated environment tests

- **Smoke util exists:** `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev` (repo root), extended in Task 12 with `POST /api/physical/refresh-switch1` unauthenticated → `401` and `GET /admin/store-list` (deep link) → `200`; the existing public-exposure checks already cover catalogue leaks. Passing: every line PASS, exit 0.
- **After Joey deploys and presses Refresh Switch 1** (owner steps, then checked together):
  - The Switch 1 registry row on `/admin/catalogue` reads `ok` with a finish time, rows in the thousands, and its info line ("`m` newly matched, `u` unmatched, `r` left to Resolve"); the line "`N` Switch 1 titles unmatched" shows under the totals.
  - Death's Door is in the catalogue as a Switch 1 cartridge: linked to its IGDB game, collapsing to `game_card` (visible through Discover's pool or a read-only query of `physical_editions` where `source = 'nscollectors_ns1'` and `title_normalized = 'death s door'`).
  - A Discover generate completes, and its pool includes Switch 1 games no store lists (a pick on Switch, or a read-only check that the pool's Switch 1 keys exceed the stores' Switch 1 listings).
  - `/admin/store-list` on a phone (375px): the Game-Key Card note, five sections in order, rows readable without horizontal scroll, Got it removes a row and the game appears privately on `/admin/collection`.
  - `/api/public/radar` and the public snapshot carry nothing new from Switch 1 (no row whose `release_source` came from the Switch 1 sheet).
- **Observability:** Render logs for the API around the refresh: `POST /api/physical/refresh-switch1` → 200, the `switch 1 registry: <n> master rows, <m> ciab` line, the `igdb POST /v4/games` lines for the title pages and snapshot batches, and no `nscollectors_ns1 run failed` traceback (search by URL with `&q=`, per memory). Green smoke plus a new error in the logs is **not done**; red enters structured debugging.
