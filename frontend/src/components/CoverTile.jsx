import { Link } from 'react-router'
import { spine } from '../content/spine.js'
import { shortDate } from '../lib/comics.js'
import { editionPath, issuePath } from '../lib/spinePaths.js'
import CoverImage from './CoverImage.jsx'

const WALL = spine.comics.wall

/**
 * The caption's short form of an edition label: a leading "Volume" becomes
 * "Vol." ("Volume One" is "Vol. One"). Any other label is shown whole.
 */
export function shortEditionLabel(label) {
  return label.replace(/^Volume\b/, 'Vol.')
}

/**
 * One issue's cover on the wall, the strip or the issue page's neighbours.
 *
 * A held, missing or skipped issue is a link named "Saga #58, Missing"; the
 * cover inside is decoration (`alt=""`), as is the read tick. A framed
 * state is a border, never colour alone: read and owned are solid, missing
 * is dashed and greyed, and the state word is in the name. A not-out issue
 * has no page, so it is a plain block with its number and date.
 *
 * A collected edition (`tile.kind === 'book'`, wall only) is the same frame
 * with a stacked edge, captioned "Vol. One" over "#1–6" and "· read to 4"
 * when partly read; a link to the edition's page, named in full.
 *
 * @param {object} props
 * @param {{kind: 'cover'|'not-out', n: number, cover_url?: string|null,
 *   store_date: string|null, state?: string}|{kind: 'book', slug: string,
 *   edition: {label: string, from: number, to: number},
 *   cover_url: string|null, readTo: number|null}} props.tile - From `wallTiles`.
 * @param {'wall'|'strip'|'inside'} props.size
 * @param {{id: string, title: string}} props.series
 * @param {boolean} [props.current] - The issue the page is about.
 */
export default function CoverTile({ tile, size, series, current = false }) {
  if (tile.kind === 'book') return <BookLink tile={tile} series={series} />
  const date = tile.store_date ? shortDate(tile.store_date) : null
  if (tile.kind === 'not-out') {
    return (
      <div className="cover-tile" data-size={size} data-state="not-out">
        <div className="cover-tile-frame" aria-hidden="true">
          <div className="cover-tile-hatch">
            <span className="cover-tile-chip">#{tile.n}</span>
          </div>
        </div>
        {date && (
          <span className="cover-tile-cap" aria-hidden="true">
            <em>{date}</em>
          </span>
        )}
        <span className="visually-hidden">
          {WALL.tileName(series.title, tile.n, WALL.names['not-out'])}
        </span>
      </div>
    )
  }
  return (
    <Link
      to={issuePath(series.id, tile.n)}
      className="cover-tile"
      data-size={size}
      data-state={tile.state}
      aria-current={current ? 'page' : undefined}
      aria-label={WALL.tileName(series.title, tile.n, WALL.names[tile.state])}
    >
      <span className="cover-tile-frame">
        {/* No `number`: the caption below already names it. */}
        <CoverImage src={tile.cover_url} type="comic" alt="" />
        {tile.state === 'read' && (
          <span className="cover-tile-tick" aria-hidden="true">
            ✓
          </span>
        )}
      </span>
      <span className="cover-tile-cap" aria-hidden="true">
        <span>#{tile.n}</span>
        {date && <em>{date}</em>}
      </span>
    </Link>
  )
}

function BookLink({ tile, series }) {
  const { edition, readTo } = tile
  const range =
    edition.from === edition.to
      ? `#${edition.from}`
      : `#${edition.from}–${edition.to}`
  return (
    <Link
      to={editionPath(series.id, tile.slug)}
      className="cover-tile book-tile"
      data-size="wall"
      data-state="book"
      aria-label={WALL.bookName(
        edition.label,
        edition.from,
        edition.to,
        readTo,
      )}
    >
      <span className="cover-tile-frame">
        <CoverImage src={tile.cover_url} type="comic" alt="" />
      </span>
      <span className="cover-tile-cap" aria-hidden="true">
        <span>{shortEditionLabel(edition.label)}</span>
        <em>
          {range}
          {readTo !== null && ` · ${WALL.readTo(readTo)}`}
        </em>
      </span>
    </Link>
  )
}
