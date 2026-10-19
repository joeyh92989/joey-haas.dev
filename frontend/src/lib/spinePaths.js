/**
 * Paths to Spine's item, year and month pages, always in the slash form.
 *
 * The prerendered page for /spine/<id> is dist/spine/<id>/index.html, which
 * Render serves at /spine/<id>/ only: the bare form falls to the SPA
 * catch-all and previews as the site card. A redirect cannot add the slash
 * (Render matches /spine/x/ against /spine/:id too and loops; see
 * render.yaml), so every link, canonical URL and sitemap entry uses the
 * slash form instead. React Router matches either form, so a path without a
 * prerendered page (an item newer than the build) still renders in the SPA.
 */
import { spine } from '../content/spine.js'

/** `/spine/<id>/`, the item page. */
export function itemPath(id) {
  return `${spine.path}/${encodeURIComponent(id)}/`
}

/** `/spine/year/<year>/`, Year in review. */
export function yearPath(year) {
  return `${spine.path}/year/${year}/`
}

/** `/spine/journal/<yyyy-mm>/`, a month's page. */
export function monthPath(month) {
  return `${spine.path}/journal/${month}/`
}
