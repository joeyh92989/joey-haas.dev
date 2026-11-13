import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMediaQuery } from '../lib/useMediaQuery.js'
import ShowMore from './ShowMore.jsx'

const NARROW = '(max-width: 34rem)'
/** Rows in a page: four on a desktop, six on a phone (three covers a row). */
const ROWS = 4
const ROWS_NARROW = 6
/** Columns assumed until the grid has been measured (and where nothing measures). */
const FALLBACK_COLUMNS = 7

/** How many columns the grid has laid out right now. */
function columnsOf(grid) {
  const tracks = getComputedStyle(grid).gridTemplateColumns
  const count = tracks && tracks !== 'none' ? tracks.split(' ').length : 0
  return count > 0 ? count : FALLBACK_COLUMNS
}

/**
 * A responsive grid of shelf cards. Presentational only: the page decides
 * what each card is through `renderCard`.
 *
 * The column minimum comes from CSS (`--poster-min`), switched by `data-size`
 * and dropped to 6rem on narrow screens so a phone fits three across.
 *
 * With `paged`, only whole rows show at first (columns x 4, or x 6 on a
 * phone) and a Show more row follows. The columns are read from the laid-out
 * grid, so a page never ends mid-row. The page resets to the first when
 * `resetKey` changes (a new filter, search or sort).
 *
 * @param {object} props
 * @param {object[]} props.items - Rows to render, already filtered and sorted.
 * @param {'comfortable'|'compact'} props.size - Poster size.
 * @param {(item: object) => import('react').ReactNode} props.renderCard -
 *   Renders one card.
 * @param {boolean} [props.paged] - Page the grid. Off by default.
 * @param {string} [props.resetKey] - Changing it returns a paged grid to its
 *   first page.
 */
export default function PosterGrid({
  items,
  size,
  renderCard,
  paged = false,
  resetKey = '',
}) {
  const narrow = useMediaQuery(NARROW)
  const gridRef = useRef(null)
  const [columns, setColumns] = useState(FALLBACK_COLUMNS)
  const [pages, setPages] = useState(1)
  const [showAll, setShowAll] = useState(false)
  const [seenKey, setSeenKey] = useState(resetKey)
  if (seenKey !== resetKey) {
    setSeenKey(resetKey)
    setPages(1)
    setShowAll(false)
  }

  // Layout effect: the columns are known before the first paint, so a page
  // of the fallback size never flashes.
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!paged || !grid || typeof ResizeObserver === 'undefined') return
    const measure = () => setColumns(columnsOf(grid))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(grid)
    return () => observer.disconnect()
  }, [paged, size])

  const step = columns * (narrow ? ROWS_NARROW : ROWS)
  const shown =
    paged && !showAll ? Math.min(items.length, step * pages) : items.length
  const list = shown === items.length ? items : items.slice(0, shown)

  // Showing more can unmount the button that was pressed (the last page, or
  // Show all), which would drop focus to the body. Focus goes to the first
  // card that was revealed instead.
  const focusFrom = useRef(null)
  useEffect(() => {
    const from = focusFrom.current
    focusFrom.current = null
    if (from === null) return
    gridRef.current
      ?.querySelectorAll(':scope > li')
      [from]?.querySelector('a, button')
      ?.focus()
  }, [shown])

  return (
    <>
      <ul className="poster-grid" data-size={size} ref={gridRef}>
        {list.map((item) => (
          <li key={item.finish_key ?? item.id}>{renderCard(item)}</li>
        ))}
      </ul>
      {paged && (
        <ShowMore
          shown={shown}
          total={items.length}
          step={step}
          onMore={() => {
            focusFrom.current = shown
            setPages((current) => current + 1)
          }}
          onAll={() => {
            focusFrom.current = shown
            setShowAll(true)
          }}
        />
      )}
    </>
  )
}
