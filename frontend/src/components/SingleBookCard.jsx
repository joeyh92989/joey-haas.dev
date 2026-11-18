import { Link } from 'react-router'
import { spine } from '../content/spine.js'
import { volumePath } from '../lib/spinePaths.js'
import CoverImage from './CoverImage.jsx'
import StatePill from './StatePill.jsx'

const BOOKS = spine.comics.books
const VOLUME = spine.comics.volume

/**
 * A single book's title page leads with the one book: its cover, name,
 * format and number in a line (when it has one), whether it is owned or read,
 * and a link to its own page. No wall and no run bar: one book needs neither.
 *
 * @param {object} props
 * @param {object} props.comic - The public comic block (`volumes[0]` is the book).
 * @param {{id: string, title: string}} props.series
 */
export default function SingleBookCard({ comic, series }) {
  const book = comic.volumes?.[0]
  if (!book) return null
  const facts = [
    VOLUME.kinds[book.kind] ?? book.kind,
    book.line_number != null ? VOLUME.number(book.line_number) : null,
  ].filter(Boolean)
  return (
    <section className="item-card single-book" aria-labelledby="item-book">
      <div className="single-book-cover">
        <CoverImage src={book.cover_url} type="comic" alt="" />
      </div>
      <div className="single-book-text">
        <h2 id="item-book">{BOOKS.single.title}</h2>
        <p className="single-book-name">
          <b>{book.label}</b>
        </p>
        <p className="muted">{facts.join(' · ')}</p>
        <p>
          <StatePill state={book.read ? 'read' : 'owned'} />
        </p>
        <p>
          <Link to={volumePath(series.id, book.slug)}>{BOOKS.single.link}</Link>
        </p>
      </div>
    </section>
  )
}
