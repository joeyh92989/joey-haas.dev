/**
 * Samples one URL per dynamic route kind from a sitemap. Shared by the
 * screenshot run (`npm run shots`) and the dynamic-route browser tests.
 */

/** Regex source for a UUID-shaped item id, used inside the shelf kinds. */
export const ID = '[0-9a-f]{8}-[0-9a-f-]{27}'

/**
 * One path pattern per dynamic route kind, in the order `sampleRoutes`
 * returns them: shelf item, year, month, edition, issue, blog, TIL, travel.
 */
export const KINDS = [
  new RegExp(`^/shelf/${ID}/$`),
  /^\/shelf\/year\/[^/]+\/$/,
  /^\/shelf\/journal\/[^/]+\/$/,
  new RegExp(`^/shelf/${ID}/ed-[^/]+/$`),
  new RegExp(`^/shelf/${ID}/\\d+/$`),
  /^\/blog\/[^/]+\/$/,
  /^\/til\/[^/]+\/$/,
  /^\/travel\/[^/]+\/$/,
]

/** The shelf's dynamic kinds (the first five of `KINDS`), by name. */
export const SHELF_KINDS = {
  item: KINDS[0],
  year: KINDS[1],
  month: KINDS[2],
  edition: KINDS[3],
  issue: KINDS[4],
}

/** Every `<loc>` in a sitemap as a pathname with a trailing slash. */
export function sitemapPaths(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => {
    const { pathname } = new URL(m[1])
    return pathname.endsWith('/') ? pathname : `${pathname}/`
  })
}

/** Picks the first sitemap path of each dynamic kind that has one. */
export function sampleRoutes(xml) {
  const paths = sitemapPaths(xml)
  return KINDS.flatMap((kind) => {
    const hit = paths.find((p) => kind.test(p))
    return hit ? [hit] : []
  })
}
