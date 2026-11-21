import { useEffect, useId, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { KIND_ORDER, books as COPY } from '../content/adminVolume.js'
import { spine } from '../content/spine.js'
import {
  adminVolumePath,
  createVolume,
  listVolumes,
} from '../lib/volumeEdits.js'
import CoverImage from './CoverImage.jsx'
import LoadState from './LoadState.jsx'
import Panel from './Panel.jsx'
import StatePill from './StatePill.jsx'
import { FIELD, LABEL, MUTED, PLAIN } from './adminDataClasses.js'

const KINDS = spine.comics.volume.kinds

/** One book of the title: cover, name, number, format, marks, entries. */
function BookRow({ itemId, book }) {
  return (
    <li className="admin-book">
      <span className="admin-book-cover">
        <CoverImage src={book.cover_url} type="comic" alt="" />
      </span>
      <span className="admin-book-text">
        <Link to={adminVolumePath(itemId, book.slug)}>{book.label}</Link>
        <span className={`${MUTED} admin-book-facts`}>
          {[
            book.line_number != null
              ? spine.comics.volume.number(book.line_number)
              : null,
            KINDS[book.kind] ?? book.kind,
            COPY.entries(book.collects_count),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {book.collects_count === 0 && (
          <span className={`${MUTED} admin-book-facts`}>
            {COPY.noContents}
            {' · '}
            <Link to={adminVolumePath(itemId, book.slug)}>
              {COPY.findContents}{' '}
              <span className="visually-hidden">
                {COPY.findContentsFor(book.label)}
              </span>
            </Link>
          </span>
        )}
      </span>
      <span className="admin-book-marks">
        {book.owned ? (
          <StatePill state="owned" />
        ) : (
          <span className="comic-private">{COPY.notOwned}</span>
        )}
        {book.read && <StatePill state="read" />}
      </span>
    </li>
  )
}

/**
 * The Books panel on a comic's admin page: the title's books in line order,
 * each linking to its admin page, and Add a book (name, format, number in its
 * line), which opens the new book's page. It replaces the Editions panel,
 * whose JSONB list is no longer written from the UI.
 *
 * @param {object} props
 * @param {string} props.itemId - The title's item id.
 */
export default function BooksPanel({ itemId }) {
  const navigate = useNavigate()
  const ids = useId()
  const [state, setState] = useState({ status: 'loading', books: [] })
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState(KIND_ORDER[0])
  const [number, setNumber] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState(null)

  const [tries, setTries] = useState(0)

  useEffect(() => {
    let cancelled = false
    listVolumes(itemId)
      .then((books) => {
        if (!cancelled) setState({ status: 'ready', books })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', books: [] })
      })
    return () => {
      cancelled = true
    }
  }, [itemId, tries])

  function retry() {
    setState({ status: 'loading', books: [] })
    setTries((count) => count + 1)
  }

  async function add(event) {
    event.preventDefault()
    setError(null)
    setAdding(true)
    try {
      const created = await createVolume(itemId, {
        label,
        kind,
        ...(number === '' ? {} : { line_number: Number(number) }),
      })
      navigate(adminVolumePath(itemId, created.slug))
    } catch (failure) {
      setError(failure)
      setAdding(false)
    }
  }

  const field = (name) => error?.fields?.[name]
  const general = error && Object.keys(error.fields ?? {}).length === 0

  return (
    <Panel title={COPY.title}>
      {state.status === 'loading' && <LoadState loading />}
      {state.status === 'error' && <LoadState failed onRetry={retry} />}
      {state.status === 'ready' &&
        (state.books.length === 0 ? (
          <p className={MUTED}>{COPY.empty}</p>
        ) : (
          <ul className="admin-books" aria-label={COPY.list}>
            {state.books.map((book) => (
              <BookRow key={book.id} itemId={itemId} book={book} />
            ))}
          </ul>
        ))}

      <form className="admin-book-add" onSubmit={add} noValidate>
        <h3>{COPY.add.heading}</h3>
        <div className="admin-book-add-fields">
          <div>
            <label htmlFor={`${ids}-label`} className={LABEL}>
              {COPY.add.label}
            </label>
            <input
              className={FIELD}
              id={`${ids}-label`}
              value={label}
              placeholder={COPY.add.labelHint}
              aria-invalid={field('label') ? true : undefined}
              aria-describedby={
                field('label') ? `${ids}-label-error` : undefined
              }
              onChange={(event) => setLabel(event.target.value)}
            />
            {field('label') && (
              <p id={`${ids}-label-error`} className="admin-error" role="alert">
                {field('label')}
              </p>
            )}
          </div>
          <div>
            <label htmlFor={`${ids}-kind`} className={LABEL}>
              {COPY.add.kind}
            </label>
            <select
              className={FIELD}
              id={`${ids}-kind`}
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              {KIND_ORDER.map((value) => (
                <option key={value} value={value}>
                  {KINDS[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${ids}-number`} className={LABEL}>
              {COPY.add.number}
            </label>
            <input
              className={FIELD}
              id={`${ids}-number`}
              type="number"
              min="1"
              inputMode="numeric"
              value={number}
              aria-invalid={field('line_number') ? true : undefined}
              aria-describedby={
                field('line_number') ? `${ids}-number-error` : undefined
              }
              onChange={(event) => setNumber(event.target.value)}
            />
            {field('line_number') && (
              <p
                id={`${ids}-number-error`}
                className="admin-error"
                role="alert"
              >
                {field('line_number')}
              </p>
            )}
          </div>
        </div>
        <button type="submit" className={PLAIN} disabled={adding}>
          {adding ? COPY.add.adding : COPY.add.submit}
        </button>
        {general && (
          <p className="admin-error" role="alert">
            {error.message || COPY.add.failed}
          </p>
        )}
      </form>
    </Panel>
  )
}
