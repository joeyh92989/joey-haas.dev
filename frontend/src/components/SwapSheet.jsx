import { useEffect, useId, useState } from 'react'
import { LOAD_ERROR } from '../content/status.js'
import { apiFetch } from '../lib/api.js'
import { categoryLabel } from '../lib/closet.js'
import { Swatch } from './OutfitSwatches.jsx'
import Sheet from './Sheet.jsx'

/**
 * Swap a piece: the outfit's slots as chips, and the chosen slot's
 * candidates from `GET /api/closet/candidates` (the day's filter, ranked,
 * no model). Choosing one hands its tile back; nothing is re-ranked, the
 * choice is the owner's.
 *
 * Used by Today and by the Closet card on admin Home.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {{garments: {slot: string, id: string}[]}|null} props.outfit
 * @param {string} props.occasion
 * @param {boolean} props.bike
 * @param {string} [props.slot] The slot to open on; the first otherwise.
 * @param {() => void} props.onClose
 * @param {(tile: object) => void} props.onChoose
 */
export default function SwapSheet({
  open,
  outfit,
  occasion,
  bike,
  slot,
  onClose,
  onChoose,
}) {
  const titleId = useId()
  return (
    <Sheet
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      className="swap-sheet"
    >
      {open && outfit && (
        <SwapBody
          titleId={titleId}
          outfit={outfit}
          occasion={occasion}
          bike={bike}
          initialSlot={slot ?? outfit.garments[0]?.slot}
          onClose={onClose}
          onChoose={onChoose}
        />
      )}
    </Sheet>
  )
}

function SwapBody({
  titleId,
  outfit,
  occasion,
  bike,
  initialSlot,
  onClose,
  onChoose,
}) {
  const [slot, setSlot] = useState(initialSlot)
  // {slot, candidates} once read, {slot, error} when it failed.
  const [read, setRead] = useState(null)
  const current = outfit.garments.find((g) => g.slot === slot)

  useEffect(() => {
    let live = true
    const query = new URLSearchParams({
      slot,
      occasion,
      bike: String(bike),
    })
    apiFetch(`/api/closet/candidates?${query}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`status ${response.status}`)
        const body = await response.json()
        if (live) setRead({ slot, candidates: body.candidates })
      })
      .catch(() => {
        if (live) setRead({ slot, error: LOAD_ERROR })
      })
    return () => {
      live = false
    }
  }, [slot, occasion, bike])

  const loaded = read?.slot === slot ? read : null
  const others = (loaded?.candidates ?? []).filter((c) => c.id !== current?.id)

  return (
    <div className="sheet-body">
      <h2 id={titleId}>Swap a piece</h2>
      <div className="chip-row" role="group" aria-label="Slot">
        {outfit.garments.map((g) => (
          <button
            key={g.slot}
            type="button"
            className="chip"
            aria-pressed={g.slot === slot}
            onClick={() => setSlot(g.slot)}
          >
            {categoryLabel(g.slot) ?? g.slot}
          </button>
        ))}
      </div>
      {!loaded && <p className="muted">Loading…</p>}
      {loaded?.error && (
        <p className="admin-error" role="alert">
          {loaded.error}
        </p>
      )}
      {loaded && !loaded.error && others.length === 0 && (
        <p className="muted">Nothing else fits this slot today.</p>
      )}
      {others.length > 0 && (
        <ul className="swap-list">
          {others.map((tile) => (
            <li key={tile.id}>
              <button
                type="button"
                className="swap-choice"
                onClick={() => onChoose(tile)}
              >
                <Swatch garment={tile} />
                <span className="swap-choice-text">
                  <span className="garment-name">{tile.name}</span>
                  <span className="garment-stat">{tile.qualifier}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="sheet-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
