import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { posts } from '../content/posts.js'
import { staticPages } from '../content/pages.js'
import { loadIndex, pageEntry, search } from '../lib/searchIndex.js'

/** The bundled Pages group, there before (and without) the index. */
const PAGE_ENTRIES = staticPages(posts.length > 0).map(pageEntry)

/**
 * The site search: a native modal <dialog> holding a combobox and its
 * listbox of grouped results.
 *
 * Like MobileNavSheet, the owner holds `open`, and every way of closing it
 * (Escape, a backdrop click, choosing a row) goes through `onClose`. Focus
 * goes back to whatever had it when the dialog opened, once it has closed:
 * while modal, the page behind is inert and would refuse focus.
 *
 * Focus stays in the input throughout; ↑/↓ move a highlight that
 * `aria-activedescendant` reports, and Enter follows it. The Pages group
 * is bundled, so it shows at once; the index (posts, shelf, comics) joins
 * when `loadIndex()` resolves, or a note says search is unavailable.
 *
 * @param {object} props
 * @param {boolean} props.open Whether the dialog is showing.
 * @param {() => void} props.onClose Called for every way of closing it.
 */
export default function SearchDialog({ open, onClose }) {
  const ref = useRef(null)
  const inputRef = useRef(null)
  const returnFocus = useRef(null)
  const navigate = useNavigate()
  const id = useId()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [index, setIndex] = useState(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement
      dialog.showModal()
      inputRef.current?.focus()
    }
    if (!open && dialog.open) {
      dialog.close()
      returnFocus.current?.focus?.()
      returnFocus.current = null
    }
  }, [open])

  useEffect(() => {
    if (!open || index?.entries) return
    let cancelled = false
    loadIndex().then((result) => {
      if (!cancelled) setIndex(result)
    })
    return () => {
      cancelled = true
    }
    // A failed load is retried on the next open, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const entries = useMemo(() => {
    if (!index?.entries) return PAGE_ENTRIES
    // /blog is both bundled and in the index; keep one.
    const bundled = new Set(PAGE_ENTRIES.map((entry) => entry.href))
    return [
      ...PAGE_ENTRIES,
      ...index.entries.filter((entry) => !bundled.has(entry.href)),
    ]
  }, [index])

  const { groups, count } = useMemo(
    () => search(entries, query),
    [entries, query],
  )
  const rows = groups.flatMap((group) => group.rows)
  const current = rows.length ? Math.min(active, rows.length - 1) : -1
  const optionId = (position) => `${id}-option-${position}`
  const listId = `${id}-list`

  function close() {
    setQuery('')
    setActive(0)
    onClose()
  }

  function go(row) {
    close()
    navigate(row.href)
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!rows.length) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current + step + rows.length) % rows.length)
    } else if (event.key === 'Enter' && current >= 0) {
      event.preventDefault()
      go(rows[current])
    }
  }

  function handleCancel(event) {
    event.preventDefault()
    close()
  }

  function handleClose() {
    if (open) close()
  }

  function handleClick(event) {
    if (event.target === event.currentTarget) close()
  }

  let position = 0
  const trimmed = query.trim()

  return (
    <dialog
      ref={ref}
      className="search-dialog"
      aria-label="Search the site"
      onCancel={handleCancel}
      onClose={handleClose}
      onClick={handleClick}
    >
      {open && (
        <div className="search-body">
          <div className="search-head">
            <input
              ref={inputRef}
              type="search"
              className="search-input"
              role="combobox"
              aria-label="Search"
              aria-expanded={rows.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                current >= 0 ? optionId(current) : undefined
              }
              placeholder="Pages, posts, games, comics…"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActive(0)
              }}
              onKeyDown={handleKeyDown}
            />
            <button type="button" className="btn sm" onClick={close}>
              Close
            </button>
          </div>

          <div
            id={listId}
            role="listbox"
            aria-label="Results"
            className="search-list"
          >
            {groups.map((group) => (
              <div
                key={group.key}
                role="group"
                aria-labelledby={`${id}-${group.key}`}
                className="search-group"
              >
                {/* Not a heading: a listbox may own only groups and
                    options (axe's aria-required-children). The label
                    names the group instead. */}
                <span
                  id={`${id}-${group.key}`}
                  role="presentation"
                  className="search-group-label kicker"
                >
                  {group.label}
                </span>
                {group.rows.map((row) => {
                  const mine = position++
                  return (
                    <div
                      key={`${row.g}:${row.href}`}
                      id={optionId(mine)}
                      role="option"
                      aria-selected={mine === current}
                      className="search-row"
                      onClick={() => go(row)}
                      onMouseMove={() => mine !== current && setActive(mine)}
                    >
                      <RowMark row={row} />
                      <span className="search-row-text">
                        <span className="search-row-title">{row.title}</span>
                        {row.sub && (
                          <span className="search-row-sub muted">
                            {row.sub}
                          </span>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {index?.unavailable && (
            <p className="search-note muted">
              Search is unavailable right now; pages still work.
            </p>
          )}
          {trimmed && rows.length === 0 && (
            <p className="search-note">
              Nothing for ‘{trimmed}’.{' '}
              <Link
                to={`/shelf?q=${encodeURIComponent(trimmed)}`}
                onClick={close}
              >
                Search the shelf
              </Link>
            </p>
          )}
          <p className="visually-hidden" role="status" aria-live="polite">
            {trimmed ? `${count} ${count === 1 ? 'result' : 'results'}` : ''}
          </p>
        </div>
      )}
    </dialog>
  )
}

/** A row's 32px mark: the cover when it has one, else its group's glyph. */
function RowMark({ row }) {
  const [failed, setFailed] = useState(false)
  if (row.cover && !failed) {
    return (
      <img
        className="search-mark search-cover"
        src={row.cover}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <svg
      className="search-mark search-glyph"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d={GLYPHS[row.g] ?? GLYPHS.pages} />
    </svg>
  )
}

const GLYPHS = {
  pages: 'M6 3h8l4 4v14H6zM14 3v4h4',
  posts: 'M5 5h14M5 10h14M5 15h10M5 20h7',
  notes: 'M5 4h14v12l-4 4H5zM15 20v-4h4',
  shelf: 'M4 5h4v15H4zM10 5h4v15h-4zM16 7l3-1 3 13-3 1z',
  comics: 'M4 4h7v16H4zM13 4h7v16h-7z',
}
