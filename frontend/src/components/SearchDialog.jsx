import { useEffect, useId, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { posts } from '../content/posts.js'
import { searchPages } from '../content/pages.js'
import { hiddenPaths } from '../lib/snapshotPresence.js'
import { cx } from '../lib/cx.js'
import Sheet from './Sheet.jsx'
import { Button } from './ui/button.jsx'
import { Input } from './ui/input.jsx'
import { loadIndex, pageEntry, search } from '../lib/searchIndex.js'

/** The bundled Pages group, there before (and without) the index. */
const PAGE_ENTRIES = searchPages(posts.length > 0)
  .filter((entry) => !hiddenPaths.includes(entry.path))
  .map(pageEntry)

const NOTE = 'm-0 border-t border-t-border px-4 py-3 [&_a]:text-accent-text'

/**
 * The site search: a native modal <dialog> holding a combobox and its
 * listbox of grouped results.
 *
 * It renders through Sheet: the owner holds `open`, and every way of closing
 * it (Escape, a backdrop click, choosing a row) goes through `onClose`.
 * Focus goes back to whatever had it when the dialog opened.
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
  const navigate = useNavigate()
  const id = useId()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [index, setIndex] = useState(null)

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
    // A file is not a route: the SPA would answer it with its own 404.
    if (row.href.endsWith('.pdf')) window.location.assign(row.href)
    else navigate(row.href)
  }

  function handleKeyDown(event) {
    // An IME's own Enter and arrows pick its candidates, not a row.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === 'Escape') {
      // A search field clears its text on the first Escape (a native
      // behaviour), which left the dialog open over the page with the
      // default list showing (#482). Escape closes it, text and all.
      event.preventDefault()
      close()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!rows.length) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current + step + rows.length) % rows.length)
    } else if (event.key === 'Enter' && current >= 0) {
      event.preventDefault()
      go(rows[current])
    }
  }

  let position = 0
  const trimmed = query.trim()

  return (
    <Sheet
      open={open}
      onClose={close}
      ariaLabel="Search the site"
      variant="bare"
      className="search-dialog mx-auto mt-[12vh] mb-auto max-h-[76vh] w-[36rem] max-w-[calc(100%-32px)] overflow-hidden rounded-[var(--radius)] border border-border bg-card p-0 text-foreground open:flex open:flex-col backdrop:bg-(--overlay) motion-safe:open:animate-[search-in_140ms_ease-out] motion-safe:open:backdrop:animate-[search-fade_140ms_ease-out] max-[640px]:m-0 max-[640px]:max-h-dvh max-[640px]:w-full max-[640px]:max-w-none max-[640px]:rounded-none max-[640px]:border-x-0 max-[640px]:border-t-0"
      initialFocus=".search-input"
    >
      <div className="flex min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b border-b-border p-3">
          <Input
            type="search"
            className="search-input min-h-11 min-w-0 flex-1 md:text-base"
            role="combobox"
            aria-label="Search"
            aria-expanded={rows.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={current >= 0 ? optionId(current) : undefined}
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
          <Button
            type="button"
            variant="quiet"
            size="sm"
            className="max-[700px]:min-h-11"
            onClick={close}
          >
            Close
          </Button>
        </div>

        <div
          id={listId}
          role="listbox"
          aria-label="Results"
          className="overflow-y-auto overscroll-contain pt-1 pb-2"
        >
          {groups.map((group) => (
            <div
              key={group.key}
              role="group"
              aria-labelledby={`${id}-${group.key}`}
            >
              {/* Not a heading: a listbox may own only groups and
                    options (axe's aria-required-children). The label
                    names the group instead. */}
              <span
                id={`${id}-${group.key}`}
                role="presentation"
                className="kicker block px-4 pt-3 pb-1"
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
                    className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2 aria-selected:bg-(--search-active) aria-selected:[box-shadow:inset_3px_0_0_var(--accent)]"
                    onClick={() => go(row)}
                    onMouseMove={() => mine !== current && setActive(mine)}
                  >
                    <RowMark row={row} />
                    <span className="grid min-w-0">
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                        {row.title}
                      </span>
                      {row.sub && (
                        <span className="muted overflow-hidden text-[0.8125rem] text-ellipsis whitespace-nowrap">
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
          <p className={cx(NOTE, 'muted')}>
            Search is unavailable right now; pages still work.
          </p>
        )}
        {trimmed && rows.length === 0 && (
          <p className={NOTE}>
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
    </Sheet>
  )
}

/** A row's 32px mark: the cover when it has one, else its group's glyph. */
function RowMark({ row }) {
  const [failed, setFailed] = useState(false)
  if (row.cover && !failed) {
    return (
      <img
        className="size-8 flex-none rounded-[3px] object-cover"
        src={row.cover}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <svg
      className="size-8 flex-none rounded-[3px] fill-none stroke-current p-2 text-(--text-3) [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.6]"
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
