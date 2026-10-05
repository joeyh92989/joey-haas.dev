/**
 * What's next's page-side helpers. The sections themselves come from the
 * server (backend/next_list.py); grouping by console and sorting are the
 * page's job (Spine Next spec, B6).
 */

/** Buy now's console groups, in a store visit's order. */
export const NEXT_PLATFORMS = [
  'Nintendo Switch 2',
  'Nintendo Switch',
  'Nintendo 64',
]

/**
 * Rows grouped by platform: the known consoles first, in order, then any
 * other platform by name. Empty groups are dropped.
 *
 * @param {Array<{platform: string|null}>} rows
 * @returns {Array<{platform: string, rows: object[]}>}
 */
export function groupByPlatform(rows) {
  const groups = new Map()
  for (const row of rows) {
    const key = row.platform ?? 'Other'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  const rank = (name) => {
    const index = NEXT_PLATFORMS.indexOf(name)
    return index === -1 ? NEXT_PLATFORMS.length : index
  }
  return [...groups.keys()]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((platform) => ({ platform, rows: groups.get(platform) }))
}

/**
 * Buy now in the visitor's chosen order: the server's best match, or the
 * newest public date first with undated rows last.
 *
 * @param {Array<{release_date: string|null}>} rows
 * @param {'best'|'newest'} sort
 */
export function sortBuyNow(rows, sort) {
  if (sort !== 'newest') return rows
  return [...rows].sort((a, b) => {
    if (!a.release_date) return b.release_date ? 1 : 0
    if (!b.release_date) return -1
    return b.release_date.localeCompare(a.release_date)
  })
}

/**
 * The shelf band's numbers.
 *
 * @param {{tonight: {up_next: {title: string}|null, picks: {title: string}[]}, buy_now: unknown[], preorders: unknown[]}} next
 */
export function bandCounts(next) {
  return {
    tonight:
      next.tonight?.up_next?.title ?? next.tonight?.picks?.[0]?.title ?? null,
    toBuy: next.buy_now?.length ?? 0,
    preorders: next.preorders?.length ?? 0,
  }
}
