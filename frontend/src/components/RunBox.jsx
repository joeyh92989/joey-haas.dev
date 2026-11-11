import { useEffect, useRef, useState } from 'react'
import { spine } from '../content/spine.js'
import { boxTiles } from '../lib/comicRun.js'

const BOX = spine.comics.run.box

const range = (from, to) => (from === to ? `#${from}` : `#${from}–${to}`)

/**
 * What is physically held, in issue order: a book tile per collected
 * edition, a cell per single issue, a bundle for 12 or more consecutive
 * issues in one state outside any edition, and one hatched cell for the
 * next dated issue. An issue is drawn once: in its book or as a cell.
 *
 * A bundle is a button that opens into its cells, with a fold button first
 * that closes it; which bundles are open lasts for the visit, not stored.
 * Focus follows the swap: opening lands on the fold, folding on the
 * bundle.
 *
 * Modes:
 * - `public`: cells and books are decoration (`aria-hidden`); the sentence
 *   under the box is their text equivalent.
 * - `toggle`: signed in on the public page, a single issue's cell toggles
 *   it owned (`aria-pressed`); the caller saves at once.
 * - `edit`: the admin editor, every cell a button named with its number
 *   and state; what a tap does is the caller's tap mode. Books are never
 *   buttons (comics spec, D6): editions are edited as rows.
 *
 * @param {object} props
 * @param {ReturnType<import('../lib/comicRun.js').runModel>} props.model
 * @param {'public'|'toggle'|'edit'} [props.mode]
 * @param {(issue: object) => void} [props.onCell]
 * @param {boolean} [props.busy] - Ignore taps while a save runs; the
 *   buttons stay focusable (aria-disabled, not disabled).
 */
export default function RunBox({ model, mode = 'public', onCell, busy }) {
  const [open, setOpen] = useState(() => new Set())
  const focusKey = useRef(null)
  const boxRef = useRef(null)
  const tiles = boxTiles(model, open)

  useEffect(() => {
    if (!focusKey.current) return
    const target = boxRef.current?.querySelector(
      `[data-focus="${focusKey.current}"]`,
    )
    focusKey.current = null
    target?.focus()
  })

  const reveal = (from, to, show) => {
    setOpen((current) => {
      const next = new Set(current)
      for (let n = from; n <= to; n += 1) {
        if (show) next.add(n)
        else next.delete(n)
      }
      return next
    })
  }

  const tap = (issue) => {
    if (busy) return
    // The tapped issue stays drawn as a cell whatever its stretch becomes.
    if (!open.has(issue.n)) setOpen((current) => new Set(current).add(issue.n))
    onCell?.(issue)
  }

  const hidden = mode === 'public' ? true : undefined
  const interactive =
    mode !== 'public' ||
    tiles.some((tile) => tile.type === 'bundle' || tile.type === 'fold')

  const renderTile = (tile) => {
    switch (tile.type) {
      case 'book':
        return (
          <span
            key={`book-${tile.edition.index}`}
            className="run-book"
            data-k={tile.k}
            aria-hidden={hidden}
          >
            <b>{tile.edition.label}</b>
            <small>
              {tile.from === tile.to ? tile.from : `${tile.from}–${tile.to}`}
              {tile.readTo != null && ` · ${BOX.readTo(tile.readTo)}`}
            </small>
          </span>
        )
      case 'bundle': {
        const words = `${tile.count} ${BOX.bundleWord[tile.k]}`
        return (
          <button
            key={`bundle-${tile.from}`}
            type="button"
            className="run-bundle"
            data-k={tile.k}
            data-focus={`bundle-${tile.from}`}
            aria-expanded="false"
            aria-label={BOX.bundleName(tile.from, tile.to, words)}
            onClick={() => {
              focusKey.current = `fold-${tile.from}`
              reveal(tile.from, tile.to, true)
            }}
          >
            <b>{range(tile.from, tile.to)}</b>
            <small>{words}</small>
          </button>
        )
      }
      case 'fold':
        return (
          <button
            key={`fold-${tile.from}`}
            type="button"
            className="run-cell"
            data-fold=""
            data-focus={`fold-${tile.from}`}
            aria-expanded="true"
            aria-label={BOX.foldName(tile.from, tile.to)}
            onClick={() => {
              focusKey.current = `bundle-${tile.from}`
              reveal(tile.from, tile.to, false)
            }}
          >
            −
          </button>
        )
      case 'next':
        return (
          <i
            key="next"
            className="run-cell"
            data-k="upcoming"
            aria-hidden="true"
          >
            {tile.number}
          </i>
        )
      default:
        return renderCell(tile)
    }
  }

  const renderCell = ({ n, k, issue }) => {
    if (mode === 'edit') {
      return (
        <button
          key={`cell-${n}`}
          type="button"
          className="run-cell"
          data-k={k}
          aria-label={BOX.cellName(n, BOX.cellState[k])}
          aria-disabled={busy || undefined}
          onClick={() => tap(issue)}
        >
          {n}
        </button>
      )
    }
    if (mode === 'toggle') {
      return (
        <button
          key={`cell-${n}`}
          type="button"
          className="run-cell"
          data-k={k}
          aria-pressed={issue.held}
          aria-label={`Issue ${n}`}
          aria-disabled={busy || undefined}
          onClick={() => tap(issue)}
        >
          {n}
        </button>
      )
    }
    return (
      <i key={`cell-${n}`} className="run-cell" data-k={k} aria-hidden="true">
        {n}
      </i>
    )
  }

  return (
    <div className="run-box-frame">
      {/* Public, a box with no bundle has nothing to operate, and the
          sentence under it says what it shows: decoration, not an empty
          labelled group. */}
      <div
        ref={boxRef}
        className="run-box"
        {...(interactive
          ? { role: 'group', 'aria-label': BOX.label }
          : { 'aria-hidden': true })}
      >
        {tiles.map(renderTile)}
      </div>
    </div>
  )
}
