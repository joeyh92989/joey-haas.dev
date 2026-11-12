import { useEffect, useRef } from 'react'
import { spine } from '../content/spine.js'
import CoverTile from './CoverTile.jsx'

const COPY = spine.comics.issue

/**
 * The issues either side of this one, as small cover tiles: a list that
 * scrolls sideways inside itself and opens with the current issue in the
 * middle. It replaces previous and next links.
 *
 * @param {object} props
 * @param {{number: number, cover_url: string|null, state: string}[]} props.list
 *   - The API's `neighbours`, current issue included.
 * @param {number} props.current - The issue the page is about.
 * @param {{id: string, title: string}} props.series
 */
export default function NeighbourStrip({ list, current, series }) {
  const currentRef = useRef(null)

  useEffect(() => {
    // jsdom has no scrollIntoView. `nearest` on the block axis keeps the
    // page itself from jumping; only the strip scrolls.
    currentRef.current?.scrollIntoView?.({ inline: 'center', block: 'nearest' })
  }, [current])

  return (
    <ol className="neighbour-strip" aria-label={COPY.neighbours}>
      {list.map((entry) => {
        const isCurrent = entry.number === current
        const tile =
          entry.state === 'not-out'
            ? { kind: 'not-out', n: entry.number, store_date: null }
            : {
                kind: 'cover',
                n: entry.number,
                cover_url: entry.cover_url,
                store_date: null,
                state: entry.state,
              }
        return (
          <li key={entry.number} ref={isCurrent ? currentRef : undefined}>
            <CoverTile
              tile={tile}
              size="strip"
              series={series}
              current={isCurrent}
            />
          </li>
        )
      })}
    </ol>
  )
}
