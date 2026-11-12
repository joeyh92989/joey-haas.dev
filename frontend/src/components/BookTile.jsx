import { Link } from 'react-router'
import { spine } from '../content/spine.js'
import { editionPath } from '../lib/spinePaths.js'
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
 * A collected edition on the wall: a cover with a stacked edge, captioned
 * "Vol. One" over "#1–6", and "· read to 4" when partly read. A link to the
 * edition's page, named in full.
 *
 * @param {object} props
 * @param {{slug: string, edition: {label: string, from: number, to: number},
 *   cover_url: string|null, readTo: number|null}} props.tile - From `wallTiles`.
 * @param {{id: string, title: string}} props.series
 */
export default function BookTile({ tile, series }) {
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
