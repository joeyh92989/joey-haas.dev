import { comicIntake as words } from '../../content/comicIntake.js'

/**
 * The collected books Details typed on comic entries, as the commit will
 * write them (`entry.books_preview`, from the server's own plan): label,
 * kind, range and the ISBN when one was typed. Draws nothing when no
 * entry has any.
 *
 * @param {object} props
 * @param {object[]} props.entries Settled entries of the sitting.
 */
export default function TypedBooksPreview({ entries }) {
  const rows = entries.flatMap((entry) =>
    (entry.books_preview ?? []).map((book, index) => ({
      key: `${entry.id}-${index}`,
      title:
        entry.chosen?.title ??
        entry.payload?.detected_title ??
        entry.payload?.title ??
        null,
      book,
    })),
  )
  if (rows.length === 0) return null
  return (
    <>
      <h3 className="kicker intake-skim-head">
        {words.typedBooksHead(rows.length)}
      </h3>
      <ul className="intake-typed-books">
        {rows.map(({ key, title, book }) => (
          <li key={key}>
            {title && <b>{title}: </b>}
            {words.typedBook(
              book.label,
              words.editionKinds[book.edition_kind] ?? book.edition_kind,
              book.from,
              book.to,
            )}
            {book.isbn && (
              <span className="mono muted">
                {' '}
                · {words.typedBookIsbn(book.isbn)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
