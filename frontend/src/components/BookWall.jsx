import { spine } from '../content/spine.js'
import { PANEL_HEAD } from './detail-classes.js'
import CoverTile from './CoverTile.jsx'

const BOOKS = spine.comics.books

/**
 * The books of a title in the wall's order: a book line's places 1..the
 * highest owned number (an owned book, or a hollow gap), then the owned
 * books with no number; with no places, just the books in the order the API
 * sent them. A body from before `slots` and `volumes` draws nothing.
 *
 * @param {{slots?: {number: number, slug: string|null}[],
 *   volumes?: object[]}} comic - The public comic block.
 * @returns {object[]} Tiles for `CoverTile`.
 */
export function bookTiles(comic) {
  const volumes = comic.volumes ?? []
  const bySlug = new Map(volumes.map((volume) => [volume.slug, volume]))
  const placed = new Set()
  const tiles = []
  for (const slot of comic.slots ?? []) {
    const volume = slot.slug ? bySlug.get(slot.slug) : null
    if (volume) {
      placed.add(volume.slug)
      tiles.push({ ...volume, format: volume.kind, kind: 'volume' })
    } else {
      tiles.push({ kind: 'vol-gap', number: slot.number })
    }
  }
  for (const volume of volumes) {
    if (!placed.has(volume.slug))
      tiles.push({ ...volume, format: volume.kind, kind: 'volume' })
  }
  return tiles
}

/**
 * What is owned, in words: "I have Vol. 1, 2 and 4". It never says how long
 * the line is; only the highest number owned shows, through the places.
 */
export function haveLine(comic) {
  const volumes = comic.volumes ?? []
  const numbers = [
    ...new Set(
      volumes.map((volume) => volume.line_number).filter((n) => n != null),
    ),
  ].sort((a, b) => a - b)
  // Two books sharing a number are both numbered.
  const unnumbered = volumes.filter((volume) => volume.line_number == null)
  return BOOKS.have(numbers, unnumbered.length)
}

/**
 * The Books section of a title page: the line as a wall of covers, owned and
 * missing, each place named with its number.
 *
 * @param {object} props
 * @param {object} props.comic - The public comic block.
 * @param {{id: string, title: string}} props.series
 */
export default function BookWall({ comic, series }) {
  const tiles = bookTiles(comic)
  if (tiles.length === 0) return null
  return (
    <section className="item-card cover-wall" aria-labelledby="item-books">
      <h2 id="item-books" className={PANEL_HEAD}>
        {BOOKS.title}
      </h2>
      <p className="book-wall-have muted">{haveLine(comic)}</p>
      <div className="cover-wall-grid">
        {tiles.map((tile) => (
          <CoverTile
            key={tile.kind === 'volume' ? tile.slug : `gap-${tile.number}`}
            tile={tile}
            size="wall"
            series={series}
          />
        ))}
      </div>
    </section>
  )
}
