# Catalogue Store Keys — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Spec: `docs/planning/2026-09-26-catalogue-store-keys-design.md`.

**Goal:** Every catalogue key names the game alone, so a store listing's IGDB
search can find it: platform words, packaging editions and single-game
bundle suffixes out; accents folded; two store platform bugs fixed; and a
test over every recorded page that fails when a key keeps any of them.

**Architecture:** One title vocabulary in `physical_sources/parse.py`,
applied by `strip_title` for every source (stores, registry, tracker).
`matching.normalize_title` folds accents for everyone. `STORES` gets two
platform-step fixes. The fixture recorder learns `--all-pages`, and a new
key-quality test runs over the whole recorded catalogue.

**Tech Stack:** Python 3.12 (`backend/.venv`), `re`, `unicodedata`,
pytest against a real Postgres, ruff.

**Branch:** `catalogue-store-keys` (worktree
`~/Developer/joey-haas.dev-worktrees/catalogue-store-keys`, cut from
`origin/main` at `c694c0a`).

## Global Constraints

- Python 3.12 via `backend/.venv`; `import httpx2`, never `httpx`.
- Backend commands run from `backend/`; every commit gated on
  `./.venv/bin/ruff format . && ./.venv/bin/ruff check .` and
  `./.venv/bin/python -m pytest -q -W error::SyntaxWarning`, checking exit
  codes (the shell is zsh: capture `$?` to a variable, never trust a pipe).
- Every new pattern runs in linear time on third-party text; each gets a
  case in `test_a_long_run_is_linear`. `strip_title` never returns `""`.
- `title` and `source_ref` stay raw; only `title_normalized` changes.
- No migration. Nothing from the catalogue becomes public.
- Never commit a fixture containing a credential; the recorder's Sheets key
  is a query parameter and is redacted from failures.
- Commits ≤5 files, except the one fixture-data commit (Task 2), which holds
  only recorded JSON.

## Deviation from the spec (decided while planning)

The spec says a bracket is removed when it holds **only** platform words.
The fixtures show stores put platform words beside other words inside one
bracket: `(iam8bit Nintendo Switch 2 Exclusive Edition)`, `(Nintendo Switch
Exclusive Edition)`, `(With iam8bit Nintendo Switch 2 Exclusive Edition)`.
Under "only", all of these would stay in the key. The plan keeps today's
rule instead: a bracket is removed when it **contains** a platform word, a
region code, "Various Platforms" or "pre-order". A bracket without one
(`[Rewind]`, `(Uncensored)`) stays.

## File structure

| File | Responsibility | Tasks |
|---|---|---|
| `backend/scripts/record_physical_fixtures.py` | `--all-pages` walk for Shopify and WooCommerce; size report and gate | 1 |
| `backend/scripts/README.md` | how and when to record all pages | 1 |
| `backend/tests/test_record_physical_fixtures.py` (new) | pure paging helpers of the recorder | 1 |
| `backend/tests/fixtures/physical/shopify/**/*.pN.json`, `woocommerce/**` | recorded pages 2+ | 2 |
| `backend/matching.py` | accent folding in `normalize_title` | 3 |
| `backend/tests/test_matching.py` | accent cases | 3 |
| `backend/physical_sources/stores.py` | Premium Edition and iam8bit platform steps | 4 |
| `backend/tests/test_physical_shopify.py` | platform assertions | 4 |
| `backend/physical_sources/parse.py` | the title vocabulary | 5 |
| `backend/tests/test_physical_parse.py` | vocabulary cases and timing cases | 5 |
| `backend/tests/physical_support.py` | `corpus_rows()` over every recorded page | 6 |
| `backend/tests/test_physical_keys.py` (new) | the key-quality test | 6 |
| `backend/physical_sources/README.md` | keying rules, corpus | 7 |
| `docs/planning/2026-09-26-catalogue-store-keys-plan.md` | Execution summary | 7 |

---

### Task 1: The recorder walks every page

**Parallel-safe:** yes (no shared file with Tasks 3–5).

**Files:**
- Modify: `backend/scripts/record_physical_fixtures.py`
- Modify: `backend/scripts/README.md`
- Create: `backend/tests/test_record_physical_fixtures.py`

**Interfaces:**
- Produces: `page_url(url: str, page: int) -> str`,
  `page_out(out: str, page: int) -> str`,
  `is_last_page(count: int, size: int) -> bool`, and the CLI flag
  `--all-pages`. Files are named `<handle>.p<N>.json` beside `.p1.json`.

- [ ] **Step 1: Write the failing test**

```python
"""The fixture recorder's paging helpers (the fetching is owner-run)."""

import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "scripts" / "record_physical_fixtures.py"
spec = importlib.util.spec_from_file_location("record_physical_fixtures", SCRIPT)
recorder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recorder)


def test_page_url_replaces_the_page_parameter():
    url = "https://a.test/collections/x/products.json?limit=250&page=1"
    assert recorder.page_url(url, 3) == (
        "https://a.test/collections/x/products.json?limit=250&page=3"
    )


def test_page_out_numbers_the_file():
    assert recorder.page_out("shopify/a/x.p1.json", 2) == "shopify/a/x.p2.json"


def test_a_short_page_is_the_last():
    assert recorder.is_last_page(249, 250)
    assert recorder.is_last_page(0, 250)
    assert not recorder.is_last_page(250, 250)
```

- [ ] **Step 2: Run it and see it fail**

Run: `./.venv/bin/python -m pytest -q tests/test_record_physical_fixtures.py`
Expected: FAIL, `AttributeError: module 'record_physical_fixtures' has no attribute 'page_url'`.

- [ ] **Step 3: Implement the helpers and the walk**

In `record_physical_fixtures.py`, beside `_safe`:

```python
# --all-pages stops here even if a store keeps answering full pages: the
# adapters stop at MAX_PAGES too, and a runaway walk is not a fixture.
MAX_RECORDED_PAGES = 40
# Past this, pages 2 and on are written without body_html (spec: size gate).
SIZE_GATE_BYTES = 40 * 1024 * 1024


def page_url(url: str, page: int) -> str:
    """The same listing URL asking for another page."""
    return re.sub(r"([?&]page=)\d+", rf"\g<1>{page}", url)


def page_out(out: str, page: int) -> str:
    """shopify/a/x.p1.json -> shopify/a/x.p<page>.json"""
    return re.sub(r"\.p\d+\.json$", f".p{page}.json", out)


def is_last_page(count: int, size: int) -> bool:
    """A page shorter than the page size is the last one."""
    return count < size
```

A shared walker, called by `record_shopify` after page 1 is written (and by
`record_woo` the same way, with `WOO_PAGE_SIZE` and the list payload):

```python
async def record_more_pages(
    recorder: "Recorder",
    url: str,
    out: str,
    first_count: int,
    size: int,
    products_of,
) -> None:
    """Pages 2 and on of one listing, until a short or empty page.

    `products_of(payload)` returns the payload's product list, or None when
    the body is not one (recorded as a failure, as page 1 is).
    """
    if is_last_page(first_count, size):
        return
    for page in range(2, MAX_RECORDED_PAGES + 1):
        page_link, page_file = page_url(url, page), page_out(out, page)
        if not recorder.allowed(page_file, page_link):
            return
        payload = await recorder.get_json(page_file, page_link)
        products = products_of(payload) if payload is not None else None
        if products is None:
            recorder.fail(page_file, "no products list in the body")
            return
        if not products:
            return
        for product in products:
            product["images"] = (product.get("images") or [])[:1]
            if recorder.strip_bodies:
                product.pop("body_html", None)
                product.pop("description", None)
        recorder.write_json(page_file, page_file, payload)
        print(f"ok   {page_file}  {len(products)} products")
        if is_last_page(len(products), size):
            return
```

In `record_shopify`, after `seen[out] = products`:

```python
        if all_pages:
            await record_more_pages(
                recorder, url, out, len(products), SHOPIFY_PAGE_SIZE,
                lambda body: body.get("products") if isinstance(body, dict) else None,
            )
```

In `record_woo`, after the page-1 write:

```python
        if all_pages:
            await record_more_pages(
                recorder, url, out, len(payload), WOO_PAGE_SIZE,
                lambda body: body if isinstance(body, list) else None,
            )
```

Both gain an `all_pages: bool = False` parameter.
`Recorder` gains `strip_bodies: bool = False` and `bytes_written: int`
(summed in `write`). `record()` takes `all_pages`; after all sources it
prints `fixtures: <MB> MB` from a walk of `FIXTURES`. The `--all-pages` flag
is added to `main()` and passed through; `--list` prints
`(and following pages until a short page)` after each listing URL when set.
`--strip-bodies` sets `recorder.strip_bodies` (the size gate's second run).

- [ ] **Step 4: Run the test and see it pass**

Run: `./.venv/bin/python -m pytest -q tests/test_record_physical_fixtures.py`
Expected: 3 passed.

- [ ] **Step 5: Document**

`scripts/README.md`, recorder section, add: `--all-pages` records every
page of every handle (one owner-approved run, same robots and throttle
rules), why (the key-quality test needs the live catalogue's shapes, not
page 1's), the size gate (re-run with `--all-pages --strip-bodies` when the
first run reports more than 40 MB; only pages 2+ lose `body_html`), and that
route tests still serve page 1 only.

- [ ] **Step 6: Gate and commit**

```bash
git add backend/scripts/record_physical_fixtures.py backend/scripts/README.md backend/tests/test_record_physical_fixtures.py
git commit -m "feat(physical): record every page of the store fixtures on request"
```

---

### Task 2: Record all pages

**Parallel-safe:** no (needs Task 1; Task 6 needs it).

**Files:**
- Create: `backend/tests/fixtures/physical/shopify/<store>/<handle>.p2…pN.json`
- Create/modify: `backend/tests/fixtures/physical/woocommerce/<store>/*.json`

- [ ] **Step 1: Dry run**

Run: `./.venv/bin/python scripts/record_physical_fixtures.py --list --all-pages`
Expected: every store's listing URLs, no request made.

- [ ] **Step 2: Record the stores only**

Run: `./.venv/bin/python scripts/record_physical_fixtures.py --all-pages limited_run iam8bit strictly_limited premium_edition nicalis aksys_us aksys_eu fangamer super_rare pixelheart gamefairy oneprint`
Expected: `ok` lines per page, a `fixtures: <MB> MB` line, exit 0 (a
failure exits 1 and names the page; report it, do not retry in a loop).
The registry, tracker and IGDB fixtures are not re-recorded.

- [ ] **Step 3: Size gate**

If the report is over 40 MB, re-run Step 2 with `--strip-bodies` added: it
rewrites the same `.pN.json` files without descriptions (page 1 keeps its
bodies, which the format and date tests read). Record the final size for
the Execution summary.

- [ ] **Step 4: Check no page-1 fixture changed shape**

Run: `git diff --stat -- tests/fixtures/physical | tail -3` and
`./.venv/bin/python -m pytest -q tests/test_physical_*.py`.
Expected: the physical suite passes. A re-recorded `.p1.json` is today's
data; any test that pinned a product no longer listed is reported at the
checkpoint, not edited to pass. If page-1 changes break tests, restore the
page-1 files with `git checkout -- 'tests/fixtures/physical/**/*.p1.json'`
and keep only the new pages.

- [ ] **Step 5: Credential check**

Run: `grep -rl "key=" tests/fixtures/physical | head` and
`grep -rlE "AIza[0-9A-Za-z_-]{20,}" tests/fixtures/physical`.
Expected: no output from the second command.

- [ ] **Step 6: Commit (data only)**

```bash
git add backend/tests/fixtures/physical
git commit -m "test(physical): record every page of the store catalogues"
```

---

### Task 3: Fold accents in `normalize_title`

**Parallel-safe:** yes.

**Files:**
- Modify: `backend/matching.py:65-73`
- Test: `backend/tests/test_matching.py`

**Interfaces:**
- Produces: `normalize_title(title: str) -> str`, same signature;
  `"Pokémon"` → `"pokemon"`.

- [ ] **Step 1: Write the failing test** (in `test_matching.py`, beside
  `test_normalize_folds_case_and_punctuation`)

```python
@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("Pokémon Legends: Z-A", "pokemon legends z a"),
        ("Café Enchanté", "cafe enchante"),
        ("Ōkami HD", "okami hd"),
        ("ＦＵＬＬ ＷＩＤＴＨ", "full width"),
        ("Cave Story®+", "cave story"),
        ("Moomintroll: Winter’s Warmth", "moomintroll winter s warmth"),
    ],
)
def test_normalize_folds_accents(title, expected):
    assert normalize_title(title) == expected
```

(Add `import pytest` if the module lacks it.)

- [ ] **Step 2: Run it and see it fail**

Run: `./.venv/bin/python -m pytest -q tests/test_matching.py -k accents`
Expected: FAIL on the first four cases (`'pok mon legends z a'`).

- [ ] **Step 3: Implement**

```python
import unicodedata


def normalize_title(title: str) -> str:
    """Case-folded, accent-folded, punctuation-free, single-spaced.

    Spines and box art disagree with catalogues about hyphens, colons, and
    typographic characters constantly. Comparing raw strings would score
    "Spider-Man: No Way Home" against "Spider Man No Way Home" as a near miss
    rather than the same film. Accents fold to their letters (NFKD, then the
    combining marks dropped): "Pokémon" and IGDB's "Pokemon" are one title,
    and a key without its accented letters could not be searched at all.
    """
    decomposed = unicodedata.normalize("NFKD", title.casefold())
    folded = "".join(char for char in decomposed if not unicodedata.combining(char))
    return _NON_ALPHANUMERIC.sub(" ", folded).strip()
```

- [ ] **Step 4: Run the whole suite**

Run: `./.venv/bin/python -m pytest -q` (importer tests use this too).
Expected: all pass. A failing importer or catalogue test that pinned an
accent-stripped key is updated to the folded key, and named in the commit.

- [ ] **Step 5: Gate and commit**

```bash
git add backend/matching.py backend/tests/test_matching.py
git commit -m "fix(matching): fold accents instead of dropping them"
```

---

### Task 4: Two store platform fixes

**Parallel-safe:** yes.

**Files:**
- Modify: `backend/physical_sources/stores.py` (iam8bit `platform=` at
  ~135, premium_edition `platform=` at ~198)
- Test: `backend/tests/test_physical_shopify.py`

- [ ] **Step 1: Write the failing tests**

```python
@pytest.mark.parametrize(
    ("title_start", "platform_id"),
    [
        ("Crisis Wing - Standard Edition (PlayStation 4)", 48),
        ("9 Years of Shadows Collector's Edition [PlayStation 5]", 167),
        ("AK-Xolotl Collector's Edition [PlayStation 5]", 167),
        ("Risk System [PlayStation 4]", 48),
        ("Kemono Heroes [PlayStation 5]", 167),
    ],
)
def test_premium_edition_reads_the_title_before_the_product_type(
    title_start, platform_id
):
    """Premium Edition files PS4/PS5 products under 'Nintendo Switch Games'."""
    rows = rows_for("premium_edition", title_start)
    assert rows
    assert {row.platform_id for row in rows} == {platform_id}


def test_premium_edition_keeps_a_switch_game_typed_playstation():
    (row,) = rows_for("premium_edition", "Colossus Down Destroy'em Up Edition")
    assert row.platform_id == 130


def test_iam8bit_reads_a_platform_named_in_the_edition_option():
    rows = rows_for("iam8bit", "Ori Collector's Edition")
    assert 130 in {row.platform_id for row in rows}
    xbox = [row for row in rows if "X1" in (row.raw.get("sku") or "")]
    assert xbox and all(row.platform_id != 130 for row in xbox)


@pytest.mark.parametrize(
    "title_start", ["Cuphead Collector's Edition", "Spiritfarer Collector's Edition"]
)
def test_iam8bit_switch_variants_named_in_other_options_are_switch(title_start):
    assert 130 in {row.platform_id for row in rows_for("iam8bit", title_start)}
```

Before running, confirm each `title_start` against the page-1 fixtures
(`grep -l` the title in `tests/fixtures/physical/shopify/<store>/`) and
where `row.raw` keeps the SKU (`grep -n '"sku"' physical_sources/shopify.py`);
use the field the adapter actually stores. If a title is only on a later
page, the test waits for Task 2's fixtures: `rows_for` reads page 1, so
extend `page()` to read every `.pN.json` of the handle first (a two-line
change in the test module's helper, same commit).

- [ ] **Step 2: Run them and see them fail**

Run: `./.venv/bin/python -m pytest -q tests/test_physical_shopify.py -k "premium or iam8bit"`
Expected: the premium cases fail with `{130}`; Ori's Xbox case fails.

- [ ] **Step 3: Implement**

```python
            # (iam8bit) The platform is an option named Platform, Edition or
            # Style depending on the product. Not "Title": Shopify's default
            # single option is named Title ("Default Title"), and reading it
            # would switch the tags step off for every one-variant product.
            platform=(
                "option:Platform",
                "option:Edition",
                "option:Style",
                "title",
                "sku_contains:-N2-=Switch 2",
                "product_type",
                "tags",
            ),
```

```python
            # (premium_edition) Title first: the store files PS4/PS5 products
            # under the "Nintendo Switch Games" product type.
            platform=("title", "product_type", "tags"),
```

- [ ] **Step 4: Run the shopify suite**

Run: `./.venv/bin/python -m pytest -q tests/test_physical_shopify.py`
Expected: all pass, `test_premium_edition_alisa` included.

- [ ] **Step 5: Gate and commit**

```bash
git add backend/physical_sources/stores.py backend/tests/test_physical_shopify.py
git commit -m "fix(physical): read Premium Edition's title and iam8bit's platform options"
```

---

### Task 5: The title vocabulary

**Parallel-safe:** yes.

**Files:**
- Modify: `backend/physical_sources/parse.py:199-265` (`_BRACKETED` to
  `game_title`)
- Test: `backend/tests/test_physical_parse.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `strip_title(title, patterns=()) -> str` and
  `game_title(title) -> str`, same signatures, stricter output; module
  constant `PLATFORM_WORDS: tuple[str, ...]` (the lower-case words and
  phrases a key must never contain) for Task 6.

- [ ] **Step 1: Write the failing tests** (extend `test_strip_title`'s
  parametrize list; patterns `()` unless shown)

```python
        ("7th Sector (NSW)", (), "7th Sector"),
        ("7th Sector Special Limited Edition (NSW)", (), "7th Sector"),
        ("7'scarlet - Nintendo Switch™", (), "7'scarlet"),
        ("Jack Jeanne - Silver Edition - Nintendo Switch™", (), "Jack Jeanne"),
        (
            "Tin & Kuna - Various Platforms (PS4, NSW, XBOX)",
            (),
            "Tin & Kuna",
        ),
        (
            "C.A.R.D.S. RPG: The Misty Battlefield  -Total Warfare Edition- "
            "(Various Platforms (PS4, NSW))",
            (),
            "C.A.R.D.S. RPG: The Misty Battlefield",
        ),
        ("Just Shapes & Beats for Nintendo Switch™", (), "Just Shapes & Beats"),
        ("UFO 50 for Nintendo Switch™ Deluxe Edition", (), "UFO 50"),
        ("Bugsnax for PlayStation 5 and PlayStation 4", (), "Bugsnax"),
        ("Zombie Night Terror - Nintendo Switch", (), "Zombie Night Terror"),
        ("9 Years of Shadows Collector's Edition [PlayStation 5]", (), "9 Years of Shadows"),
        ("Darius Extra Cozmic Bundle (NSW/SMD)", (), "Darius Extra Cozmic"),
        (
            "Tavern Talk Complete Edition - Limited Edition (Nintendo Switch)",
            (),
            "Tavern Talk",
        ),
        ("Lies of P: Complete Edition Marionette Bundle", (), "Lies of P"),
        ("Pocky & Rocky Reshrined Plushie Bundle (NSW)", (), "Pocky & Rocky Reshrined"),
        (
            "Spirit Hunter: Death Mark II - Standard Edition (with Soundtrack CD)",
            (),
            "Spirit Hunter: Death Mark II",
        ),
        (
            "Atomicrops – Complete Edition Nintendo Switch First Press SE",
            (),
            "Atomicrops",
        ),
        ("Symphonia Nintendo Switch Limited to 1,000", (), "Symphonia"),
        (
            "Blue Prince (iam8bit Nintendo Switch 2 Exclusive Edition)",
            (),
            "Blue Prince",
        ),
        ("Minecraft for Nintendo Switch 2", (), "Minecraft"),
        ("Yuppie Psycho Executive Edition - Elite Edition (Nintendo Switch)", (), "Yuppie Psycho Executive Edition"),
        ("OFF Bad Human Edition for Nintendo Switch™", (), "OFF Bad Human Edition"),
        ("Everybody 1-2-Switch!", (), "Everybody 1-2-Switch!"),
        ("Rendering Ranger: R2 [Rewind] Standard Edition (Switch, PS5, PS4)", (), "Rendering Ranger: R2 [Rewind]"),
```

The last four pin what must **not** be cut: an edition name with no
separator and no packaging word, a platform word inside a game's own name,
and a non-platform bracket.

Timing cases, added to `test_a_long_run_is_linear`'s list:
`" for" * 12_000`, `" Edition" * 8_000`, `" Bundle" * 8_000`,
`" (NSW" * 10_000`, `" - Nintendo" * 6_000`.

- [ ] **Step 2: Run them and see them fail**

Run: `./.venv/bin/python -m pytest -q tests/test_physical_parse.py -k "strip_title or linear"`
Expected: most new strip cases FAIL with today's output (e.g.
`'7th Sector Special'`).

- [ ] **Step 3: Implement**

Replace the block from `_BRACKETED` to `strip_title` with the following.
Every alternation is anchored to a separator, a bracket or the end, and
matched on collapsed text, so no pattern rescans a run.

```python
# The words stores use for a platform. The listing's platform is stored on
# its own, so none of them belongs in a key (Task 6's test reads this).
PLATFORM_WORDS = (
    "nintendo switch 2", "nintendo switch", "switch 2", "nsw", "ns2",
    "playstation 5", "playstation 4", "playstation", "ps5", "ps4",
    "xbox series x", "xbox series s", "xbox one", "xbox", "various platforms",
)
_PLATFORM = (
    r"(?:nintendo\s+)?switch™?(?:\s*2)?|ns[w2]|playstation®?(?:\s*[45])?|ps[45]"
    r"|xbox(?:\s+one|\s+series\s+[xs](?:\s*[|/]\s*[xs])?)?|pc|steam"
    r"|mega\s+drive|genesis|s?nes|n64|gb[ca]?|smd|sg|md"
)
_REGION = r"eur|usa|us|uk|jpn?|asia|pal|ntsc"
_ONE_PLATFORM = rf"(?:{_PLATFORM}|{_REGION}|various\s+platforms)"
_PLATFORM_LIST = rf"{_ONE_PLATFORM}(?:\s*(?:[,/&+|]|and)\s*{_ONE_PLATFORM})*"
# The multi-word platforms a title may end on with no separator. A lone
# "Switch" or "PC" is not among them: "Everybody 1-2-Switch!" is a name.
_BARE_PLATFORM = (
    r"nintendo\s+switch™?(?:\s*2)?|nsw|ns2|playstation®?\s*[45]|ps[45]"
    r"|xbox(?:\s+one|\s+series\s+[xs])"
)

# Innermost brackets only, their words tested separately: a class that could
# cross an opener rescanned the title from every "(" in it.
_BRACKETED = re.compile(r"\s*[(\[]([^()\[\]]*)[)\]]")
_BRACKET_WORDS = re.compile(
    rf"\b(?:{_ONE_PLATFORM}|pre-?order|with)\b|nintendo|switch", re.IGNORECASE
)
# Printing and packaging notes, not the game.
_MARKERS = re.compile(
    r"\s+(?:first\s+press(?:\s+se)?|limited\s+to\s+[\d,.]+|usk\s+version)\b.*$",
    re.IGNORECASE,
)
_PLATFORM_TAIL = re.compile(
    rf"\s*(?:\s[-–]|:|\bfor\b)\s*(?:{_PLATFORM_LIST})\s*[-–]?\s*$", re.IGNORECASE
)
_PLATFORM_TRAILING = re.compile(rf"\s+(?:{_BARE_PLATFORM})\s*$", re.IGNORECASE)
_PACKAGING = (
    r"standard|limited|special(?:\s+limited)?|deluxe|limited\s+collector['’]?s"
    r"|collector['’]?s|premium|elite|physical|complete|definitive|silver|gold"
    r"|bronze|steelbook|signature|exclusive|retail|launch|first|anniversary"
    r"|retro"
)
# "- Silver Edition", ": Complete Edition", "-Total Warfare Edition-": any
# words after a separator, up to "Edition". Without a separator only a
# packaging word may precede it, so "OFF Bad Human Edition" keeps its name.
_SEPARATED_EDITION = re.compile(
    r"\s*(?:\s[-–]|:|(?<=\s)-)\s*[^-–:()\[\]]{1,40}?\bedition\b\s*[-–]?",
    re.IGNORECASE,
)
_EDITION_PHRASE = re.compile(rf"\s*\b(?:{_PACKAGING})\s+edition\b", re.IGNORECASE)
_MERCH = (
    r"plush(?:ie)?|book|soundtrack|showroom|marionette|yunomi|cup|ce|art"
    r"|poster|vinyl|album|merch|figure|steelbook"
)
_BUNDLE = re.compile(
    rf"\s+(?:(?:{_MERCH})\s+)*bundle(?:\s+upgrade)?\s*$", re.IGNORECASE
)
_EXTRAS = re.compile(
    r"\s*\+\s*(?:character\s+cards|soundtrack(?:\s+cd)?|art\s*book|plush\w*)\s*$",
    re.IGNORECASE,
)


def _platform_bracket(match: re.Match) -> str:
    return "" if _BRACKET_WORDS.search(match.group(1)) else match.group(0)


def _tidy(text: str) -> str:
    return _SPACE.sub(" ", text).rstrip(_TRAILING).strip()


def strip_title(title: str, patterns: Iterable[re.Pattern] = ()) -> str:
    r"""The game's own title, for keys and searches.

    In order: the store's own patterns; the Switch 2 Edition phrase and
    everything after it (first, or removing "- Nintendo Switch 2" as a
    platform tail would strand "Edition"); bracket groups naming a platform,
    region or pre-order (twice, for a bracket inside a bracket); printing
    notes; then platform tails, edition phrases, bundle suffixes and merch
    extras until none is left, since each can uncover another ("UFO 50 for
    Nintendo Switch™ Deluxe Edition"). A title that is nothing but those is
    kept whole rather than keyed as an empty string.

    Whitespace is collapsed first: the phrase patterns open with `\s*`, and
    on a long run of spaces in third-party text they backtrack for minutes.
    """
    collapsed = _SPACE.sub(" ", title).strip()
    stripped = collapsed
    for pattern in patterns:
        stripped = pattern.sub("", stripped)
    stripped = _SWITCH_2_EDITION.sub("", stripped)
    for _ in range(2):
        stripped = _BRACKETED.sub(_platform_bracket, stripped)
    stripped = _MARKERS.sub("", stripped)
    for _ in range(4):
        before = stripped
        for pattern in (
            _PLATFORM_TAIL,
            _PLATFORM_TRAILING,
            _SEPARATED_EDITION,
            _EDITION_PHRASE,
            _BUNDLE,
            _EXTRAS,
        ):
            stripped = _tidy(pattern.sub("", stripped))
        if stripped == before:
            break
    return stripped or collapsed
```

`_SWITCH_2_EDITION`, `_TRAILING`, `_INVERTED_ARTICLE`, `is_switch_2_edition`,
`_uninvert` and `game_title` stay as they are.

The expected outputs above are the contract; the regexes are the plan's
best reading of the fixtures. If a case fails, adjust the pattern, never
the expected output, unless the case is wrong about the store's title (then
say so in the commit).

- [ ] **Step 4: Run the parse suite, then the physical suite**

Run: `./.venv/bin/python -m pytest -q tests/test_physical_parse.py` then
`./.venv/bin/python -m pytest -q tests/test_physical_*.py`.
Expected: all pass. A shopify/woocommerce/registry test that pinned an old
noisy key is updated to the clean key and listed in the commit body.

- [ ] **Step 5: Gate and commit**

```bash
git add backend/physical_sources/parse.py backend/tests/test_physical_parse.py
git commit -m "fix(physical): key titles without platform, edition or bundle words"
```

---

### Task 6: The key-quality test over the whole catalogue

**Parallel-safe:** no (needs Tasks 2 and 5).

**Files:**
- Modify: `backend/tests/physical_support.py`
- Create: `backend/tests/test_physical_keys.py`
- Modify (only if the test finds shapes Task 5 missed):
  `backend/physical_sources/parse.py`, `backend/tests/test_physical_parse.py`

**Interfaces:**
- Consumes: `PLATFORM_WORDS` (Task 5), `shopify.parse_page`,
  `shopify.explode(product, config, collections_seen)`,
  `woocommerce.explode(product, config)`, `registry.parse_details`,
  `registry.merge`, `registry.rows_from_values`, `tracker.parse_games`.
- Produces: `corpus_rows() -> list[tuple[str, str, str, int | None]]`
  as `(source, raw_title, title_normalized, platform_id)`, games on Switch
  or Switch 2 only, deduplicated by `(source, raw_title, platform_id)`.

- [ ] **Step 1: Add `corpus_rows()` to `physical_support.py`**

```python
def corpus_rows() -> list[tuple[str, str, str, int | None]]:
    """Every Switch and Switch 2 game row in the recorded catalogue: all
    store pages, the registry's two tabs and the tracker excerpt."""
    from physical_sources import registry, shopify, tracker, woocommerce
    from physical_sources.stores import STORES

    found: dict[tuple[str, str, int | None], str] = {}

    def keep(source, title, key, platform_id):
        if platform_id in (130, 508):
            found.setdefault((source, title, platform_id), key)

    for store_dir in sorted((PHYSICAL / "shopify").iterdir()):
        config = STORES[store_dir.name]
        for path in sorted(store_dir.glob("*.p*.json")):
            handle = path.name.split(".")[0]
            for product in shopify.parse_page(json.loads(path.read_text())):
                for row in shopify.explode(product, config, {handle}):
                    if row.is_game:
                        keep(row.store, row.title, row.title_normalized, row.platform_id)
    for store_dir in sorted((PHYSICAL / "woocommerce").iterdir()):
        config = STORES[store_dir.name]
        for path in sorted(store_dir.glob("*.json")):
            for product in json.loads(path.read_text()):
                for row in woocommerce.explode(product, config):
                    if row.is_game:
                        keep(row.store, row.title, row.title_normalized, row.platform_id)

    def tab(name):
        values = json.loads((PHYSICAL / "registry" / f"{name}.json").read_text())
        return registry.rows_from_values(values)

    details, _ = registry.parse_details(tab("details"))
    upcoming, _ = registry.parse_details(tab("upcoming_details"), upcoming=True)
    for edition in registry.merge(details, upcoming):
        keep(edition.source, edition.title, edition.title_normalized, edition.platform_id)
    games = json.loads((PHYSICAL / "tracker" / "games.json").read_text())
    for edition in tracker.parse_games(games):
        keep(edition.source, edition.title, edition.title_normalized, edition.platform_id)
    return [(s, t, k, p) for (s, t, p), k in found.items()]
```

(Match the real signatures by reading each module first; `explode`'s third
argument is the collections the product was seen in. Add `import json` if
missing.)

- [ ] **Step 2: Write the test**

```python
"""Every catalogue key names the game alone, across the recorded catalogue.

A key that keeps a platform or packaging word finds nothing on IGDB (live:
"7th sector" finds 7th Sector, "7th sector nsw" finds nothing), and the
first production store refresh queued 337 such keys with no candidate.
"""

import re

import pytest
from physical_support import corpus_rows

from physical_sources.parse import PLATFORM_WORDS

ROWS = corpus_rows()
FORBIDDEN = re.compile(
    r"\b(?:" + "|".join(re.escape(word) for word in PLATFORM_WORDS)
    + r"|edition|bundle)\b"
)
# A real game whose own name keeps a forbidden word, with the reason.
ALLOWED: dict[str, str] = {
    "off bad human edition": "the edition's name, no separator, not packaging",
}


def test_the_corpus_covers_every_store_and_source():
    sources = {source for source, *_ in ROWS}
    assert {"nscollectors", "switch2tracker", "strictly_limited", "iam8bit"} <= sources
    assert len(ROWS) > 1000


@pytest.mark.parametrize("word", ["nsw", "nintendo switch", "playstation", "edition", "bundle"])
def test_no_key_keeps_a_platform_or_packaging_word(word):
    offenders = sorted(
        f"{source}: {title!r} -> {key!r}"
        for source, title, key, _ in ROWS
        if re.search(rf"\b{re.escape(word)}\b", key) and key not in ALLOWED
    )
    assert offenders == [], "\n".join(offenders[:40])


def test_no_key_keeps_any_forbidden_word():
    offenders = sorted(
        f"{source}: {title!r} -> {key!r}"
        for source, title, key, _ in ROWS
        if FORBIDDEN.search(key) and key not in ALLOWED
    )
    assert offenders == [], "\n".join(offenders[:40])


def test_no_key_is_empty():
    assert [title for _, title, key, _ in ROWS if not key] == []
```

- [ ] **Step 3: Run it; clear what it finds**

Run: `./.venv/bin/python -m pytest -q tests/test_physical_keys.py`
Expected on first run: failures listing the shapes Task 5 missed. For each
shape: add a `test_strip_title` case (the raw title and the expected key)
and extend the vocabulary in `parse.py` until it passes. A title that is a
real game's name keeping the word goes into `ALLOWED` with its reason, never
a whole class of titles. Stop and report at the checkpoint if more than 15
distinct shapes need vocabulary, rather than growing the patterns without
review.

- [ ] **Step 4: Run the whole suite**

Run: `./.venv/bin/python -m pytest -q -W error::SyntaxWarning`
Expected: all pass.

- [ ] **Step 5: Gate and commit** (≤4 files)

```bash
git add backend/tests/physical_support.py backend/tests/test_physical_keys.py backend/physical_sources/parse.py backend/tests/test_physical_parse.py
git commit -m "test(physical): keep every catalogue key free of platform and packaging words"
```

---

### Task 6b: Resolve retries a named edition without it (added at Task 6)

**Why added:** Task 6's first run found 21 titles with a named edition and
no separator ("Elden Ring Tarnished Edition", "GEX Trilogy Classic
Edition"). Live IGDB, 8 probed: the full name matches EXACT for 5 (IGDB
lists that edition as the Switch game), and the base name drops 3 of those
to uncertain; only store-invented editions (GEX, Colossus Down) need the
base name. The owner chose: keep named editions in the key, and let Resolve
retry without the edition when the full search finds nothing. Task 6's test
therefore forbids platform words, bundles and packaging editions, and
checks every key is a fixed point of the cleaner, rather than forbidding
"edition" outright.

**Parallel-safe:** no (after Task 6).

**Files:**
- Modify: `backend/physical_sources/parse.py` (add `edition_fallbacks`)
- Modify: `backend/physical_sources/resolve.py` (`resolve_batch` search)
- Test: `backend/tests/test_physical_parse.py`,
  `backend/tests/test_physical_resolve.py`

**Interfaces:**
- Produces: `edition_fallbacks(title: str) -> list[str]`: for a title
  ending in "edition", the title with the word "edition" and then 1, 2, 3
  words before it dropped, keeping at least one word; `[]` otherwise.
  `"gex trilogy classic edition"` → `["gex trilogy", "gex"]`.

- [ ] **Step 1: Failing tests**

```python
def test_edition_fallbacks():
    assert edition_fallbacks("gex trilogy classic edition") == ["gex trilogy", "gex"]
    assert edition_fallbacks("off bad human edition") == ["off bad", "off"]
    assert edition_fallbacks("elden ring") == []
    assert edition_fallbacks("edition") == []
```

```python
@pytest.mark.asyncio
async def test_a_named_edition_is_retried_without_it_when_nothing_is_found(session):
    row = edition("GEX Trilogy Classic Edition")
    await upsert_editions(session, [row], "nscollectors", retire=True)
    igdb = FakeIgdb({"gex trilogy": [result(5, "Gex Trilogy")]})

    outcome = await resolve_batch(session, igdb)

    assert [query for query, *_ in igdb.searches] == [
        "GEX Trilogy Classic Edition",
        "gex trilogy",
    ]
    assert outcome.resolved == 1
```

(The fake answers an unknown query with `[]`; check `FakeIgdb.search` and
match its key casing.)

- [ ] **Step 2: Implement** — in `parse.py`:

```python
def edition_fallbacks(title: str, most: int = 3) -> list[str]:
    """Shorter searches for a title ending in a named edition, for when the
    full name finds nothing: "gex trilogy classic edition" -> "gex trilogy",
    then "gex". IGDB lists many named editions as the game itself, so the
    full name is always searched first."""
    words = title.split()
    if len(words) < 2 or words[-1].casefold() != "edition":
        return []
    words = words[:-1]
    return [" ".join(words[:-drop]) for drop in range(1, most + 1) if len(words) > drop]
```

In `resolve_batch`, after the first `igdb.search(...)` (inside the same
`try`): when `found` is empty, for each `shorter` in
`edition_fallbacks(title)`, search `shorter` with the same year and
platform; on the first non-empty result set `found` and `title = shorter`
(so `best_match` scores against the query that found it) and stop.

- [ ] **Step 3: Gate and commit** (4 files)

```bash
git add backend/physical_sources/parse.py backend/physical_sources/resolve.py backend/tests/test_physical_parse.py backend/tests/test_physical_resolve.py
git commit -m "fix(physical): retry a named edition's search without it"
```

---

### Task 7: Docs and the Execution summary

**Parallel-safe:** no (last).

**Files:**
- Modify: `backend/physical_sources/README.md` (registry keying paragraph
  and "Fixtures first")
- Modify: `docs/planning/2026-09-26-catalogue-store-keys-plan.md`

- [ ] **Step 1: README**

In the keying paragraph, replace the Switch-2-only description with the
general rule: every source's key goes through `strip_title` (platform
words, regions, packaging editions, single-game bundle suffixes out),
`normalize_title` folds accents, `PLATFORM_WORDS` is the list a key never
contains, and `tests/test_physical_keys.py` enforces it over every recorded
page. In "Fixtures first": the store fixtures hold every page
(`--all-pages`), route tests still serve page 1, and the size gate.

- [ ] **Step 2: Execution summary**

Append to this plan: final fixture size (and whether bodies were
stripped), each shape Task 6 added, `ALLOWED` entries and why, any test
whose pinned key changed, and deviations.

- [ ] **Step 3: Commit**

```bash
git add backend/physical_sources/README.md docs/planning/2026-09-26-catalogue-store-keys-plan.md
git commit -m "docs(physical): record the catalogue keying rules"
```

## Commit boundaries

| # | Commit | Files |
|---|---|---|
| 1 | recorder `--all-pages` | 3 |
| 2 | recorded pages (data only) | fixtures |
| 3 | accent folding | 2 |
| 4 | platform steps | 2 |
| 5 | title vocabulary | 2 |
| 6 | key-quality test (+ vocabulary it forces, plan update) | 5 |
| 6b | named-edition fallback search | 4 |
| 7 | docs | 2 |

## Zones

```
Zone 1 (auto): tasks 1–7 (6b added at Task 6, owner-approved)
CHECKPOINT — batch review + finish gate (ultra review: 4+ files)
```

Task 2 makes about 40 polite requests to the twelve stores under the
recorder's robots, throttle and User-Agent rules: the same kind of run as
the E7c fixture recording, not an infra change. No migration, CI, env or
deploy-path change.

## Automated environment tests

- **Smoke util:** exists, `scripts/smoke.sh` (repo root). Run
  `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`
  after deploy; passing is 38/38 (physical routes 401 unauthenticated, no
  catalogue data public).
- **Before merge:** the full backend suite, including
  `tests/test_physical_keys.py` over every recorded page.
- **After deploy, the owner presses Refresh stores, Refresh registry, then
  Resolve until 0.** Then, through the owner's signed-in browser session,
  GET only: `/api/physical/status` and `/api/physical/needs-match` (all
  pages). Passing:
  - `unresolved_keys` is 0;
  - `pending_keys` is well below 395;
  - pending keys with no candidate are below 100;
  - no pending key's `title_normalized` matches `PLATFORM_WORDS`,
    `edition` or `bundle`;
  - Render's application logs (search by `&q=`) show no `Traceback`,
    `ERROR` or `500 Internal` for the refresh and resolve requests.
- Red on any of these enters structured debugging, not a retry.

## Execution summary

Zone 1 ran from `2b10268`. Every commit passed ruff and the full backend
suite (815 at the start, 878 at the end).

| Commit | Task | Notes |
|---|---|---|
| `3075de2` | 1 | `--all-pages`, `--strip-bodies`, paging helpers and their tests |
| `15dd091` | 2 | Only two listings run past page 1 (iam8bit `new`, Strictly Limited `nintendo-switch`). Fixtures stay at 11.1 MB, so the size gate never applied. Page 1 was **not** replaced: re-recording it moved products seven tests pin, so it was restored and only the two new pages kept. No credential in any fixture. |
| `45da294` | 3 | Accent folding; no existing test pinned an accent-stripped key |
| `9802ba8` | 4 | Premium Edition title-first; iam8bit reads Edition/Style options. Three stores shared the old platform line; only Premium Edition's changed |
| `6a4488a` | 5 | The vocabulary. A colon is not an edition separator (it opens a subtitle: "Hollow Knight: Silksong"). Cleaners replace with a space so words never glue ("Lies of PMarionette"). `Cyberpunk 2077: Ultimate Edition` now keys as `Cyberpunk 2077` |
| `d3aea84` | 6 | The key test's first run added: an unclosed opener, "- Standard Cover", "Day One Edition", bracketed editions, a subtitle that is only an edition. Then 21 named editions with no separator: stopped and asked (below) |
| `a162d63` | 6b | Named-edition fallback search (added by the owner's decision) |

**Deviations:**

- The spec's premise that page 1 hid `(NSW)` was wrong: page 1 already held
  140 `(NSW)` titles. What was missing was a test of the keys. `--all-pages`
  stays (it covers the two long listings); the README says so.
- A bracket goes when it **contains** a platform word (planned).
- **Named editions stay in keys** (owner, 2026-09-26). Live IGDB, 8 probed:
  the full name matched EXACT for 5 (Elden Ring: Tarnished Edition, Little
  Nightmares II: Enhanced Edition, Devil May Cry 5: Devil Hunter Edition,
  Darkest Dungeon: Ancestral Edition, Slime Rancher: Plortable Edition); the
  base name dropped 3 of those to uncertain. Only store-invented editions
  (GEX Trilogy Classic, Colossus Down Destroy'em Up) needed the base name,
  which Task 6b's fallback covers. The key test therefore checks every key
  is a fixed point of the cleaner, instead of forbidding "edition".
- `edition_fallbacks` needs three words ("<name> <word> Edition"); a bare
  "<word> Edition" has none.

**`ALLOWED` in the key test:** the two "SIMPLE Series for Nintendo Switch 2
Vol. N" titles, whose series is named for the console.

**Not done here:** candidate order in Needs match, same-name IGDB ties,
multi-game bundles (all out of scope in the spec).
