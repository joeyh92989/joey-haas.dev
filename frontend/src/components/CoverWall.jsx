import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { spine } from '../content/spine.js'
import { expandRanges, shortDate } from '../lib/comics.js'
import { wallTiles } from '../lib/coverWall.js'
import { issuePath } from '../lib/spinePaths.js'
import CoverImage from './CoverImage.jsx'
import CoverTile from './CoverTile.jsx'
import EmptyState from './EmptyState.jsx'
import StatePill from './StatePill.jsx'

const RUN = spine.comics.run
const WALL = spine.comics.wall
const OWNER = WALL.owner

/** A tap moves a book one step: owned, then read, then missing again. */
const NEXT = {
  missing: 'owned',
  skipped: 'owned',
  owned: 'read',
  read: 'missing',
}

/**
 * An owner's cover: the cover is a button that moves the book one step, and
 * its number is a link beside it (a sibling, never nested). The button's name
 * says where the book is and what a tap does.
 */
function OwnerTile({ tile, series, onTap, linked }) {
  const next = NEXT[tile.state]
  const date = tile.store_date ? shortDate(tile.store_date) : null
  const stateWord = WALL.names[tile.state]
  return (
    <div className="cover-tile" data-size="wall" data-state={tile.state}>
      <div className="cover-tile-hold">
        <button
          type="button"
          className="cover-tile-btn"
          aria-label={OWNER.tapName(
            series.title,
            tile.n,
            stateWord,
            OWNER.do[next],
          )}
          onClick={() => onTap(tile.n, tile.state, next)}
        >
          <span className="cover-tile-frame">
            <CoverImage src={tile.cover_url} type="comic" alt="" />
            {tile.state === 'read' && (
              <span className="cover-tile-tick" aria-hidden="true">
                ✓
              </span>
            )}
            {tile.state === 'skipped' && (
              <span className="cover-tile-chip cover-tile-flag">
                {OWNER.skippedTag}
              </span>
            )}
            <span className="cover-tile-do" aria-hidden="true">
              {OWNER.do[next]}
            </span>
          </span>
        </button>
      </div>
      {linked ? (
        <Link
          to={issuePath(series.id, tile.n)}
          className="cover-tile-cap"
          aria-label={OWNER.openName(series.title, tile.n)}
        >
          <span>#{tile.n}</span>
          {date && <em>{date}</em>}
        </Link>
      ) : (
        // A private series has no issue page to open.
        <span className="cover-tile-cap">
          <span>#{tile.n}</span>
          {date && <em>{date}</em>}
        </span>
      )}
    </div>
  )
}

/**
 * The series page's cover wall: every book and issue of the run as a cover.
 * A long stretch of missing issues folds into one button that opens into its
 * covers, with a fold tile first that closes it again; which stretches are
 * open lasts for the visit. Signed in (`onMark`), the wall is open and each
 * cover is a button: a tap sets the book's state through `onMark`, the
 * status line under the wall says what changed and Undo puts it back.
 * Show: All or Missing (the store list).
 *
 * Owned and read come from the marks on the wall's rows; the ranges in the
 * detail still count for a row the marks have not reached.
 *
 * @param {object} props
 * @param {{issues: object[], editions: object[]}} props.wall - The body of
 *   `GET /api/public/items/{id}/issues`.
 * @param {object} props.detail - The public item detail (`comic` block).
 * @param {{id: string, title: string}} props.series
 * @param {Set<number>} [props.skipped] - Signed in only, when already held.
 * @param {boolean} [props.linked] - Whether the covers open their pages
 *   (default). The admin page of a private series has none to open.
 * @param {(n: number, state: 'missing'|'owned'|'read') => Promise<void>} [props.onMark]
 *   Signed in only: writes one book's state and resolves once the page has
 *   the new data; rejects with an Error whose message is shown.
 */
export default function CoverWall({
  wall,
  detail,
  series,
  skipped,
  onMark,
  linked = true,
}) {
  const owner = Boolean(onMark)
  const [open, setOpen] = useState(() => new Set())
  const [filter, setFilter] = useState('all')
  // Books written but not yet read back, so a tap shows at once.
  const [pending, setPending] = useState({})
  const [last, setLast] = useState(null)
  const [error, setError] = useState(null)
  const focusKey = useRef(null)
  const ref = useRef(null)
  const { comic } = detail

  const { owned, reads } = useMemo(() => {
    const heldNow = new Set(expandRanges(comic.owned_text ?? ''))
    const readNow = new Set()
    for (const row of wall.issues) {
      if (row.owned) heldNow.add(Number(row.number))
    }
    for (const n of heldNow) if (n <= (comic.read_to ?? 0)) readNow.add(n)
    for (const row of wall.issues) {
      if (row.owned && row.read) readNow.add(Number(row.number))
    }
    for (const [key, state] of Object.entries(pending)) {
      const n = Number(key)
      if (state === 'missing') heldNow.delete(n)
      else heldNow.add(n)
      if (state === 'read') readNow.add(n)
      else readNow.delete(n)
    }
    return { owned: heldNow, reads: readNow }
  }, [wall, comic, pending])

  const tiles = useMemo(
    () =>
      wallTiles(
        {
          issues: wall.issues,
          editions: wall.editions,
          owned,
          reads,
          readTo: comic.read_to ?? null,
          released: comic.released,
          nextIssue: comic.next_issue?.store_date ? comic.next_issue : null,
          skipped,
          fold: !owner,
        },
        open,
      ),
    [wall, comic, owned, reads, skipped, open, owner],
  )

  const total = Math.max(comic.released ?? 0, ...owned)
  let missingCount = 0
  for (let n = 1; n <= total; n += 1) {
    if (!owned.has(n) && !(owner && skipped?.has(n))) missingCount += 1
  }
  const shown =
    filter === 'missing'
      ? tiles.filter(
          (tile) =>
            tile.kind === 'stack' ||
            tile.kind === 'fold' ||
            (tile.kind === 'cover' && tile.state === 'missing'),
        )
      : tiles

  async function mark(n, was, now, undo = false) {
    setError(null)
    setPending((current) => ({ ...current, [n]: now }))
    try {
      await onMark(n, now)
      setLast(undo ? null : { n, was, now })
    } catch (failure) {
      setError(failure?.message || OWNER.failed)
    } finally {
      setPending((current) => {
        const rest = { ...current }
        delete rest[n]
        return rest
      })
    }
  }

  const tap = (n, was, now) => {
    mark(n, was === 'skipped' ? 'missing' : was, now)
  }

  useEffect(() => {
    if (!focusKey.current) return
    const target = ref.current?.querySelector(
      `[data-focus="${focusKey.current}"]`,
    )
    focusKey.current = null
    target?.focus()
  })

  const toggle = (key, show, focusOn) => {
    focusKey.current = focusOn
    setOpen((current) => {
      const next = new Set(current)
      if (show) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const renderTile = (tile) => {
    switch (tile.kind) {
      case 'book':
        return (
          <CoverTile
            key={`book-${tile.slug}`}
            tile={tile}
            size="wall"
            series={series}
            linked={linked}
          />
        )
      case 'stack':
        return (
          <button
            key={`stack-${tile.key}`}
            type="button"
            className="cover-stack"
            data-focus={`stack-${tile.key}`}
            aria-expanded="false"
            onClick={() => toggle(tile.key, true, `fold-${tile.key}`)}
          >
            {WALL.stack(tile.from, tile.to, tile.count)}
          </button>
        )
      case 'fold':
        return (
          <button
            key={`fold-${tile.key}`}
            type="button"
            className="cover-stack"
            data-fold=""
            data-focus={`fold-${tile.key}`}
            aria-expanded="true"
            onClick={() => toggle(tile.key, false, `stack-${tile.key}`)}
          >
            {WALL.fold}
          </button>
        )
      case 'not-out':
        return (
          <CoverTile key="not-out" tile={tile} size="wall" series={series} />
        )
      default:
        return owner ? (
          <OwnerTile
            key={`cover-${tile.n}`}
            tile={tile}
            series={series}
            onTap={tap}
            linked={linked}
          />
        ) : (
          <CoverTile
            key={`cover-${tile.n}`}
            tile={tile}
            size="wall"
            series={series}
          />
        )
    }
  }

  const keyStates = ['read', 'owned', 'missing', 'not-out']
  if (skipped?.size) keyStates.push('skipped')

  const undo = () => {
    const { n, was } = last
    mark(n, last.now, was, true)
  }

  return (
    <section className="item-card cover-wall" aria-labelledby="item-wall">
      <h2 id="item-wall">{WALL.title}</h2>
      <div className="wall-bar">
        <div className="ctl-row">
          <span className="ctl-label" id="wall-show">
            {WALL.show.label}
          </span>
          <div className="chip-row" role="group" aria-labelledby="wall-show">
            {[
              ['all', WALL.show.all, total],
              ['missing', WALL.show.missing, missingCount],
            ].map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                className="chip"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label} <span className="chip-count">{count}</span>
              </button>
            ))}
          </div>
        </div>
        {owner && <p className="wall-how">{OWNER.how}</p>}
      </div>
      {shown.length > 0 ? (
        <div ref={ref} className="cover-wall-grid">
          {shown.map(renderTile)}
        </div>
      ) : (
        <EmptyState title={WALL.nothingMissing} />
      )}
      {owner && (
        <p className="wall-status" role="status">
          {error ? (
            <span className="admin-error">{error}</span>
          ) : last ? (
            <>
              {OWNER.marked(series.title, last.n, OWNER.words[last.now])}{' '}
              <button type="button" className="link-button" onClick={undo}>
                {OWNER.undo}
              </button>
            </>
          ) : null}
        </p>
      )}
      <ul className="cover-wall-key" aria-label={RUN.key}>
        {keyStates.map((state) => (
          <li key={state}>
            <StatePill state={state} />
          </li>
        ))}
        <li>
          <span className="state-pill" data-state="book">
            {WALL.edition}
          </span>
        </li>
      </ul>
    </section>
  )
}
