/**
 * The search palette's pure core: groups, scoring, and the index fetch.
 *
 * The index (`/search-index.json`, written at build time by
 * scripts/build-search-index.mjs) is `{ entries }`, each entry
 * `{ g, t, s, title, sub, href, cover? }`: its group, its normalized title
 * and secondary text, and what a row displays. Only the query is
 * normalized per keystroke. The Pages group is also in the bundle
 * (`pageEntries`), so the palette works without the index.
 */
import { normalize } from './normalize.js'

/** Result groups, in display order. Each shows at most GROUP_LIMIT rows. */
export const GROUPS = [
  { key: 'pages', label: 'Pages' },
  { key: 'posts', label: 'Posts' },
  { key: 'notes', label: 'Notes' },
  { key: 'shelf', label: 'Shelf' },
  { key: 'comics', label: 'Comics' },
]

export const GROUP_LIMIT = 5

const GROUP_ORDER = Object.fromEntries(GROUPS.map((g, index) => [g.key, index]))

export const INDEX_URL = '/search-index.json'

/**
 * A page row from content/pages.js's shape, the same entry the index
 * script writes for it.
 *
 * @param {{path: string, title: string, description: string}} page
 */
export function pageEntry(page) {
  return {
    g: 'pages',
    t: normalize(page.title),
    s: normalize(page.description),
    title: page.title,
    sub: page.description,
    href: page.path,
  }
}

/**
 * How well an entry matches a normalized query: a title prefix 3, a title
 * word starting with it 2, anywhere in the title 1, anywhere in the
 * secondary text 0.5, else 0.
 */
export function score(entry, q) {
  if (!q) return 0
  if (entry.t.startsWith(q)) return 3
  if (` ${entry.t}`.includes(` ${q}`)) return 2
  if (entry.t.includes(q)) return 1
  if (entry.s?.includes(q)) return 0.5
  return 0
}

/**
 * Grouped results for a query. An empty query lists the Pages group alone,
 * in its own order, so the palette doubles as a site map.
 *
 * @param {object[]} entries Index entries, the bundled pages included.
 * @param {string} query What the visitor typed.
 * @returns {{groups: {key: string, label: string, rows: object[]}[],
 *   count: number}} `count` is the rows shown, for the live region.
 */
export function search(entries, query) {
  const q = normalize(query)
  let ranked
  if (!q) {
    ranked = entries.filter((entry) => entry.g === 'pages')
  } else {
    ranked = entries
      .map((entry) => ({ entry, score: score(entry, q) }))
      .filter((hit) => hit.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          GROUP_ORDER[a.entry.g] - GROUP_ORDER[b.entry.g] ||
          a.entry.title.localeCompare(b.entry.title),
      )
      .map((hit) => hit.entry)
  }
  const groups = GROUPS.map(({ key, label }) => ({
    key,
    label,
    rows: ranked.filter((entry) => entry.g === key).slice(0, GROUP_LIMIT),
  })).filter((group) => group.rows.length > 0)
  const count = groups.reduce((total, group) => total + group.rows.length, 0)
  return { groups, count }
}

const isEntry = (entry) =>
  entry !== null &&
  typeof entry === 'object' &&
  GROUP_ORDER[entry.g] !== undefined &&
  typeof entry.t === 'string' &&
  typeof entry.title === 'string' &&
  typeof entry.href === 'string' &&
  entry.href.startsWith('/')

let pending = null

/**
 * The index's entries, fetched once and cached. Never rejects: a 404, a
 * network failure or a body of the wrong shape resolves to
 * `{ unavailable: true }` and forgets the attempt, so the next open retries.
 * A plain fetch, not `force-cache`: the file changes with every deploy.
 *
 * @returns {Promise<{entries: object[]} | {unavailable: true}>}
 */
export function loadIndex() {
  if (!pending) {
    pending = fetch(INDEX_URL)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!Array.isArray(body?.entries)) throw new Error('bad index')
        return { entries: body.entries.filter(isEntry) }
      })
      .catch(() => {
        pending = null
        return { unavailable: true }
      })
  }
  return pending
}

/** Test-only: forget the cached index. */
export function resetIndexCache() {
  pending = null
}
