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

/** `/shelf/<id>/`, the item page. */
export function itemPath(id) {
  return `${spine.path}/${encodeURIComponent(id)}/`
}

/** `/shelf/year/<year>/`, Year in review. */
export function yearPath(year) {
  return `${spine.path}/year/${year}/`
}

/** `/shelf/journal/<yyyy-mm>/`, a month's page. */
export function monthPath(month) {
  return `${spine.path}/journal/${month}/`
}

/** `/shelf/<id>/<n>/`, one issue's page. */
export function issuePath(id, n) {
  return `${spine.path}/${encodeURIComponent(id)}/${encodeURIComponent(n)}/`
}

/** `/shelf/<id>/<slug>/`, one edition's page (`ed-<from>-<to>`). */
export function editionPath(id, slug) {
  return `${spine.path}/${encodeURIComponent(id)}/${encodeURIComponent(slug)}/`
}
