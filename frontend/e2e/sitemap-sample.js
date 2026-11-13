/**
 * Samples one URL per dynamic route kind from a sitemap. Shared by the
 * screenshot run (`npm run shots`) and the dynamic-route browser tests.
 */

/** One sample path per dynamic route kind, in sitemap order. */
export const ID = '[0-9a-f]{8}-[0-9a-f-]{27}'
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

/** Picks the first sitemap path of each dynamic kind. */
export function sampleRoutes(xml) {
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => {
    const { pathname } = new URL(m[1])
    return pathname.endsWith('/') ? pathname : `${pathname}/`
  })
  return KINDS.flatMap((kind) => {
    const hit = paths.find((p) => kind.test(p))
    return hit ? [hit] : []
  })
}
