import { useEffect, useMemo, useRef, useState } from 'react'
import { spine } from '../content/spine.js'
import { expandRanges } from '../lib/comics.js'
import { wallTiles } from '../lib/coverWall.js'
import BookTile from './BookTile.jsx'
import CoverTile from './CoverTile.jsx'
import StatePill from './StatePill.jsx'

const RUN = spine.comics.run
const WALL = spine.comics.wall

/**
 * The series page's cover wall: every book and issue of the run as a cover,
 * in the order of the run box it replaces. A long stretch of missing issues
 * folds into one button that opens into its covers, with a fold tile first
 * that closes it again; which stretches are open lasts for the visit. Focus
 * follows the swap, as in the run box.
 *
 * Only the tiles `wallTiles` draws from the run exist: Comic Vine rows past
 * the series' next dated issue have no page and are never linked.
 *
 * @param {object} props
 * @param {{issues: object[], editions: object[]}} props.wall - The body of
 *   `GET /api/public/items/{id}/issues`.
 * @param {object} props.detail - The public item detail (`comic` block).
 * @param {{id: string, title: string}} props.series
 * @param {Set<number>} [props.skipped] - Signed in only, when already held.
 */
export default function CoverWall({ wall, detail, series, skipped }) {
  const [open, setOpen] = useState(() => new Set())
  const focusKey = useRef(null)
  const ref = useRef(null)
  const { comic } = detail

  const tiles = useMemo(
    () =>
      wallTiles(
        {
          issues: wall.issues,
          editions: wall.editions,
          owned: new Set(expandRanges(comic.owned_text ?? '')),
          readTo: comic.read_to ?? null,
          released: comic.released,
          nextIssue: comic.next_issue?.store_date ? comic.next_issue : null,
          skipped,
        },
        open,
      ),
    [wall, comic, skipped, open],
  )

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
          <BookTile key={`book-${tile.slug}`} tile={tile} series={series} />
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
        return (
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

  return (
    <section className="item-card cover-wall" aria-labelledby="item-wall">
      <h2 id="item-wall">{WALL.title}</h2>
      <div ref={ref} className="cover-wall-grid">
        {tiles.map(renderTile)}
      </div>
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
