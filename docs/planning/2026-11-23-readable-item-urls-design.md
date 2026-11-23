# Readable item URLs (#479)

Backlog batch 7. Part of #468.

## Problem

An item page lives at `/shelf/c1fc4f22-…/`. A friend who was sent that link could not tell what
it was or whether it was safe to open. The id is also in every shared link, search result and
sitemap entry.

Acceptance (from the issue): item pages have readable URLs like `/shelf/catherine-full-body/`;
the id stays a working fallback; old UUID URLs redirect to the slug form so shared links keep
working; the sitemap uses the new form.

## Scope

In:

- `items.slug` column (additive migration `0029`), backfilled for existing rows.
- One generator (`backend/item_slugs.py`) used by every insert path and by the backfill.
- Public API: `GET /api/public/items/{key}` and the `/issues`, `/issues/{n}`, `/volumes/{slug}`
  reads under it accept a slug or a UUID. Responses carry `slug` (items) or `item_slug` /
  `series_slug` / `title_slug` (rows that link to an item).
- Frontend: `/shelf/:key` accepts either; a UUID URL replaces itself with the slug URL.
  `itemPath`, `issuePath`, `volumePath` take the key (`slug ?? id`); every public link uses it.
- Build: prerendered pages, sitemap, search index, shelf feed links use the slug. The feed GUID
  stays on the id (readers dedupe on it).
- Analytics: the beacon and the public `/stats` privacy filter understand slug paths (see below).
- Changelog entry, doc sections that name item URLs.

Out:

- Renaming a slug when the title changes (stable on purpose).
- Admin pages (`/admin/collection/:id`, `/admin/shelf/comics/:id`): they stay id-keyed. Admin
  rows that link out to a public page may still pass the id; the redirect covers them.
- Visual baselines (not regenerated; the change is URLs only).

## Decisions

1. **Additive migration, `0029`.** `items.slug` text, nullable, plus a unique partial index
   `ux_items_slug` (`WHERE slug IS NOT NULL`). The migration fills existing rows (a new column,
   so no existing value changes), oldest row first so the oldest keeps the bare slug. Downgrade
   drops the index and the column. No data is dropped or rewritten, so this is not an
   always-stop; the `neon-rehearsal` job and `tests/test_migrations.py` are the checks.
2. **Slug = slugified title.** Lowercase ASCII, diacritics stripped (NFKD), runs of anything else
   become one hyphen, trimmed, at most 80 characters (cut at a hyphen). Empty result falls back
   to the item type (`game`, `comic`, ...). A reserved word (`games`, `comics`, `next`, `how`,
   `intake`, `year`, `journal`, `daily`, `feed-xml`), a UUID-shaped string, or a slug already in
   use gets `-<first 6 hex of the id>` (8, then 12, then the whole id, if that too is taken).
   The slug is written once, at insert, and never changes when the title does.
3. **One function, three callers.** `item_slugs.slugify` and `item_slugs.unique_slug` are pure.
   Insert paths: `items.py` create (`POST /api/items`), `items.py` bulk insert
   (`pg_insert`, the importer commit), `comics_routes._create`, `recommendations_routes` (add from
   a recommendation), and any other ORM `Item(...)`. A SQLAlchemy `before_insert` mapper
   listener on `Item` fills a missing slug for every ORM insert (so a new path cannot leave it
   null); the Core `pg_insert` path calls the generator itself. A test inserts through each path
   and asserts no slug is null.
4. **Lookup.** `item_slugs.resolve_key(session, key)`: a UUID-shaped key is the id; anything else
   is looked up by slug. A UUID is tried first, so a slug can never be UUID-shaped (decision 2).
   Unknown and private keys still answer 404.
5. **Frontend.** Route `shelf/:id` keeps its path, the param is a key. `Item` fetches by key.
   When the loaded item's `slug` differs from the key (a UUID, or a stale slug), it
   `navigate(itemPath(item), {replace: true})`. The same for `/shelf/:key/:part` (issues, books),
   so shared `/shelf/<uuid>/12/` links keep working. Unknown key: `NotFound`, as today.
6. **Build.** The snapshot is the API's `/api/public/items` body, so it carries `slug` once the
   API is deployed. A build whose snapshot predates the deploy has no slugs and falls back to
   ids everywhere (`slug ?? id`); the next nightly rebuild moves to slugs. Nothing breaks
   in between.
7. **Old UUID pages keep their head.** Besides `/shelf/<slug>/`, the prerender also writes
   `/shelf/<id>/` (and the `/spine/` mirrors) with `canonical` pointing at the slug page and
   out of the sitemap, so an unfurler that never runs JavaScript still previews an old shared
   link. The app then redirects the visitor.
8. **Analytics.** `analytics.normalise_path` today accepts only UUID item paths, so a slug path
   would be silently dropped, and `public_path_filter` would not know a slug belongs to a
   private item (the public `/stats` page must never name a private item's page). Both learn the
   slug shape (excluding the reserved words, so `/shelf/year/2026` stays the year page) and the
   filter keeps a path only when its slug or id belongs to a public item.

## Rejected

- **Slug in the URL plus the id** (`/shelf/<id>/<slug>`, as Stack Overflow does): keeps one
  canonical lookup but the URL still starts with the UUID; the issue asks for a readable URL.
- **Regenerate the slug when the title changes**: breaks links already shared, the case the
  issue is about. Stable wins; a rename keeps the old slug.
- **A redirect table / history of old slugs**: nothing renames slugs, so nothing to remember.
- **Server-side redirect UUID to slug in `render.yaml`**: Render cannot look the slug up, and
  `render.yaml` carries the slash-redirect loop warning. Client-side replace it is.
- **Unique index on lower(title)**: titles repeat legitimately (remakes, same-name games).
- **Dropping the prerendered UUID heads**: simpler, but old shared links would preview as the
  generic site card.

## Smoke check

`scripts/smoke.sh` pins `GET /shelf/<first snapshot id>/`: title, slash canonical, and the
unknown-path fall-through. It changes deliberately:

- The item page is requested by `slug` when the snapshot has one (else by id), and the canonical
  expected is the slug URL.
- A new check: the same item's `/shelf/<id>/` head carries the slug canonical.
- The unknown path check (`/shelf/00000000-…/`) is unchanged.

The PR names this change. The first deploy's smoke runs against a snapshot with no slugs (the
static site builds before the API has the field), so the script falls back to the id form there.

## Ship notes

- Migration runs automatically as the first step of Deploy API. It is additive; the backfill
  is one `UPDATE` per row in batches, small table.
- `neon-rehearsal` comment is read on the PR.
- After deploy: the static site keeps id links until its next build (nightly or the next push).
  Both forms work throughout.
- Rollback: code rollback is safe, the column is ignored by older code. `alembic downgrade 0028`
  drops the column; slugs regenerate on the next upgrade (deterministic only for order, so
  collisions may suffix differently; nothing links to a suffix beyond shared links).
- Not covered: slug collisions under concurrent inserts of the same title (the unique index
  fails the second one; it is a single-owner admin app); admin rows that link to a public page
  by id; the old UUID heads in search engines stay until recrawled (canonical points to slug).
