import { Link } from 'react-router'
import { spine } from '../content/spine.js'
import { monthYear } from '../lib/comics.js'
import { volumePath, issuePath } from '../lib/spinePaths.js'
import CoverImage from './CoverImage.jsx'
import {
  TILE_CAP,
  TILE_CAP_BOOK,
  TILE_CHIP,
  TILE_HATCH,
  TILE_HOLLOW,
  TILE_TICK,
  frameClass,
  tileClass,
} from './comicClasses.js'

const WALL = spine.comics.wall
const BOOKS = spine.comics.books

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
 * A title page's book (`kind: 'volume'`, owned, from the public `volumes`)
 * links to its page, captioned "Vol. 2" over Owned or Read, or by its label
 * when it has no number. A place in the line nothing owned fills
 * (`kind: 'vol-gap'`) is a hollow block with the same dashed frame as a
 * missing issue, captioned "Vol. 3" over "not owned": a word, never hover.
 *
 * @param {object} props
 * @param {{kind: 'cover'|'not-out', n: number, cover_url?: string|null,
 *   store_date: string|null, state?: string}|{kind: 'book', slug: string,
 *   edition: {label: string, from: number, to: number},
 *   cover_url: string|null, readTo: number|null}} props.tile - From `wallTiles`.
 * @param {'wall'|'strip'} props.size
 * @param {{id: string, title: string}} props.series
 * @param {boolean} [props.current] - The issue the page is about.
 * @param {boolean} [props.linked] - A book links to its edition page (default);
 *   the admin page of a private series has none to open.
 */
export default function CoverTile({
  tile,
  size,
  series,
  current = false,
  linked = true,
}) {
  if (tile.kind === 'book')
    return <BookLink tile={tile} series={series} linked={linked} />
  if (tile.kind === 'volume') return <VolumeLink tile={tile} series={series} />
  if (tile.kind === 'vol-gap') return <VolumeGap tile={tile} />
  const date = tile.store_date ? monthYear(tile.store_date) : null
  if (tile.kind === 'not-out') {
    return (
      <div
        className={`cover-tile ${tileClass({ state: 'not-out', strip: size === 'strip' })}`}
        data-size={size}
        data-state="not-out"
      >
        <div
          className={`cover-tile-frame ${frameClass({ state: 'not-out' })}`}
          aria-hidden="true"
        >
          <div className={`cover-tile-hatch ${TILE_HATCH}`}>
            <span className={`cover-tile-chip ${TILE_CHIP}`}>#{tile.n}</span>
          </div>
        </div>
        {date && (
          <span className={`cover-tile-cap ${TILE_CAP}`} aria-hidden="true">
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
      to={issuePath(series, tile.n)}
      className={`cover-tile ${tileClass({ state: tile.state, link: true, strip: size === 'strip' })}`}
      data-size={size}
      data-state={tile.state}
      aria-current={current ? 'page' : undefined}
      aria-label={WALL.tileName(series.title, tile.n, WALL.names[tile.state])}
    >
      <span
        className={`cover-tile-frame ${frameClass({ state: tile.state, on: 'link', current })}`}
      >
        {/* No `number`: the caption below already names it. */}
        <CoverImage src={tile.cover_url} type="comic" alt="" />
        {tile.state === 'read' && (
          <span className={`cover-tile-tick ${TILE_TICK}`} aria-hidden="true">
            ✓
          </span>
        )}
      </span>
      <span className={`cover-tile-cap ${TILE_CAP}`} aria-hidden="true">
        <span>#{tile.n}</span>
        {date && <em>{date}</em>}
      </span>
    </Link>
  )
}

function BookLink({ tile, series, linked }) {
  const { edition, readTo } = tile
  const range =
    edition.from === edition.to
      ? `#${edition.from}`
      : `#${edition.from}–${edition.to}`
  const label = WALL.bookName(edition.label, edition.from, edition.to, readTo)
  if (!linked) {
    return (
      <div
        className={`cover-tile book-tile ${tileClass({ state: 'book', book: true })}`}
        data-size="wall"
        data-state="book"
        role="group"
        aria-label={label}
      >
        <span className={`cover-tile-frame ${frameClass({ state: 'book' })}`}>
          <CoverImage src={tile.cover_url} type="comic" alt="" />
        </span>
        <span className={`cover-tile-cap ${TILE_CAP_BOOK}`} aria-hidden="true">
          <span>{shortEditionLabel(edition.label)}</span>
          <em>
            {range}
            {readTo !== null && ` · ${WALL.readTo(readTo)}`}
          </em>
        </span>
      </div>
    )
  }
  return (
    <Link
      to={volumePath(series, tile.slug)}
      className={`cover-tile book-tile ${tileClass({ state: 'book', link: true, book: true })}`}
      data-size="wall"
      data-state="book"
      aria-label={label}
    >
      <span
        className={`cover-tile-frame ${frameClass({ state: 'book', on: 'link' })}`}
      >
        <CoverImage src={tile.cover_url} type="comic" alt="" />
      </span>
      <span className={`cover-tile-cap ${TILE_CAP_BOOK}`} aria-hidden="true">
        <span>{shortEditionLabel(edition.label)}</span>
        <em>
          {range}
          {readTo !== null && ` · ${WALL.readTo(readTo)}`}
        </em>
      </span>
    </Link>
  )
}

/**
 * An owned book of a title: a stacked cover that links to the book's page.
 * The state is a word under the cover and in the link's name.
 */
function VolumeLink({ tile, series }) {
  const state = tile.read ? 'read' : 'owned'
  return (
    <Link
      to={volumePath(series, tile.slug)}
      className={`cover-tile book-tile ${tileClass({ state, link: true, book: true })}`}
      data-size="wall"
      data-state={state}
      aria-label={BOOKS.tileName(tile.label, BOOKS.names[state])}
    >
      <span className={`cover-tile-frame ${frameClass({ state, on: 'link' })}`}>
        <CoverImage src={tile.cover_url} type="comic" alt="" />
      </span>
      <span className={`cover-tile-cap ${TILE_CAP_BOOK}`} aria-hidden="true">
        <span>
          {tile.line_number != null
            ? spine.comics.volume.number(tile.line_number)
            : tile.label}
        </span>
        <em>{BOOKS.states[state]}</em>
      </span>
    </Link>
  )
}

/** A place in a book line that no owned book fills. */
function VolumeGap({ tile }) {
  return (
    <div
      className={`cover-tile book-tile ${tileClass({ state: 'missing', book: true })}`}
      data-size="wall"
      data-state="missing"
      role="group"
      aria-label={BOOKS.gapName(tile.number)}
    >
      <span
        className={`cover-tile-frame ${frameClass({ state: 'missing' })}`}
        aria-hidden="true"
      >
        <span className={`cover-tile-hollow ${TILE_HOLLOW}`} />
      </span>
      <span className={`cover-tile-cap ${TILE_CAP_BOOK}`} aria-hidden="true">
        <span>{spine.comics.volume.number(tile.number)}</span>
        <em>{BOOKS.states.gap}</em>
      </span>
    </div>
  )
}
