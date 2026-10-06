/**
 * The build-time snapshot of the public collection.
 *
 * `scripts/fetch-snapshot.mjs` writes the public API's response bodies,
 * verbatim, to `/snapshot/{name}.json` when the site is built, so the
 * showcase can paint before the free-tier backend wakes. They are static files
 * on the site's own origin, not API calls, which is why pages outside
 * /spine may read them.
 *
 * A missing snapshot is normal (a local build, or a build whose fetch
 * failed), and both Render and Vite answer an unknown path with index.html,
 * so a failed parse is treated exactly like a 404.
 */

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * What's next's body: Next.jsx reads `.length` on each of these lists, so a
 * body missing one would blank the page. Keep in step with `isNextBody` in
 * scripts/fetch-snapshot.mjs: the two predicates must be identical.
 */
const NEXT_LISTS = [
  'wanted',
  'buy_now',
  'preorders',
  'later',
  'not_on_cartridge',
]
const isNextBody = (body) =>
  isObject(body) &&
  isObject(body.tonight) &&
  Array.isArray(body.tonight.picks) &&
  NEXT_LISTS.every((key) => Array.isArray(body[key]))

/** Each snapshot's name and the shape its body must have to be used. */
const SHAPES = {
  items: Array.isArray,
  stats: isObject,
  next: isNextBody,
}

/**
 * Whether a body has the shape a snapshot of `name` must have; the live
 * API's answer is held to the same rule.
 *
 * @param {string} name
 * @param {unknown} body
 * @returns {boolean}
 */
export function isValidSnapshot(name, body) {
  return Object.hasOwn(SHAPES, name) && SHAPES[name](body)
}

/**
 * Reads one snapshot.
 *
 * @param {string} name One of the SHAPES keys.
 * @returns {Promise<any|null>} The parsed body, or null when it is missing,
 *   unreadable or the wrong shape. Never rejects.
 */
export async function readSnapshot(name) {
  if (!Object.hasOwn(SHAPES, name)) return null
  const valid = SHAPES[name]
  try {
    const response = await fetch(`/snapshot/${name}.json`)
    if (!response.ok) return null
    const body = await response.json()
    return valid(body) ? body : null
  } catch {
    return null
  }
}
