/**
 * Paths to the shelf's item, year and month pages, always in the slash form.
 * The file keeps its pre-rename name; the paths follow `spine.path`, /shelf.
 *
 * The prerendered page for /shelf/<id> is dist/shelf/<id>/index.html, which
 * Render serves at /shelf/<id>/ only: the bare form falls to the SPA
 * catch-all and previews as the site card. A redirect cannot add the slash
 * (Render matches /shelf/x/ against /shelf/:id too and loops; see
 * render.yaml), so every link, canonical URL and sitemap entry uses the
 * slash form instead. React Router matches either form, so a path without a
 * prerendered page (an item newer than the build) still renders in the SPA.
 */
import { spine } from '../content/spine.js'

/** `/shelf/games`, the Games list (no slash: it is a declared static route). */
export function gamesPath() {
  return `${spine.path}/games`
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Whether a URL key is an item id (a UUID) rather than a slug. */
export function isItemId(key) {
  return UUID.test(String(key))
}

/**
 * An item's URL key: its slug (`catherine-full-body`), else its id. A row
 * with no slug (a snapshot written before slugs, an admin row) falls back to
 * the id, which the item page redirects to the slug form.
 *
 * @param {string | {id?: string, slug?: string | null}} ref An item (or any
 *   `{id, slug}`), or a bare key.
 */
export function itemKey(ref) {
  if (ref !== null && typeof ref === 'object') return ref.slug || ref.id
  return ref
}

/**
 * `/shelf/<slug>/`, the item page. Takes the item, or a bare key.
 *
 * @param {string | {id?: string, slug?: string | null}} ref
 */
export function itemPath(ref) {
  return `${spine.path}/${encodeURIComponent(itemKey(ref))}/`
}

/**
 * The item page for a row that names its item as `item_id` and `item_slug`
 * (the What's next, picks, diary and comics bodies).
 */
export function itemRowPath(row) {
  return itemPath({ id: row.item_id, slug: row.item_slug })
}

/** `/shelf/year/<year>/`, Year in review. */
export function yearPath(year) {
  return `${spine.path}/year/${year}/`
}

/** `/shelf/journal/<yyyy-mm>/`, a month's page. */
export function monthPath(month) {
  return `${spine.path}/journal/${month}/`
}

/** `/shelf/<slug>/<n>/`, one issue's page. */
export function issuePath(ref, n) {
  return `${itemPath(ref)}${encodeURIComponent(n)}/`
}

/** `/shelf/<slug>/<book>/`, one book's page (`vol-<n>` or `ed-<from>-<to>`). */
export function volumePath(ref, slug) {
  return `${itemPath(ref)}${encodeURIComponent(slug)}/`
}
