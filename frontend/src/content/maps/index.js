/**
 * The drawn maps, by trip slug: `maps/<slug>.jsx` belongs to
 * `trips/<slug>.md`. Each module exports its `viewBox`, its `fit` and the
 * drawing as its default export.
 *
 * A trip with no map file simply has no map section; the drawing is
 * hand-authored (design D2), so an old trip can go up before its map does.
 */
const modules = import.meta.glob('./*.jsx', { eager: true })

const maps = Object.fromEntries(
  Object.entries(modules).map(([path, module]) => [
    path.replace(/^\.\//, '').replace(/\.jsx$/, ''),
    { drawing: module.default, fit: module.fit, viewBox: module.viewBox },
  ]),
)

/** The map for a trip, `{drawing, fit, viewBox}`, or undefined. */
export function findMap(slug) {
  return maps[slug]
}
