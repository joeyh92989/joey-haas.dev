import { useId, useState } from 'react'
import { garmentTitle } from '../lib/closet.js'
import { Swatch } from './OutfitSwatches.jsx'
import Sheet from './Sheet.jsx'

/**
 * The listing's lines for a garment: what a resale listing asks for, from
 * what the closet already knows. Condition is the owner's own note, or a
 * reminder to look it over when there is none.
 *
 * @param {object} garment A `GarmentOut`.
 * @param {string|null} size The profile's size for its category.
 */
export function listingLines(garment, size) {
  return [
    ['Item', garmentTitle(garment)],
    ['Brand', garment.brand || 'Unknown'],
    ['Size', size || 'Not on the profile'],
    ['Condition', garment.notes || 'No notes: look it over'],
    ['Material', garment.material || 'Unknown'],
  ]
}

/**
 * Sell: the listing checklist (brand, size from the profile, condition
 * from the notes, material, the photo already on file) with Copy listing,
 * then List it, which marks the garment `listed`. Copying is optional: the
 * clipboard can be refused, and the listing is the owner's to write.
 *
 * @param {object} props
 * @param {{garment: object, size: string|null}|null} props.card The deck
 *   card being sold; the sheet is open while it is set.
 * @param {boolean} props.busy
 * @param {() => void} props.onClose
 * @param {() => void} props.onList
 */
export default function SellChecklistSheet({ card, busy, onClose, onList }) {
  const titleId = useId()
  return (
    <Sheet
      open={Boolean(card)}
      onClose={onClose}
      labelledBy={titleId}
      className="sell-sheet"
    >
      {card && (
        <SellBody
          titleId={titleId}
          card={card}
          busy={busy}
          onClose={onClose}
          onList={onList}
        />
      )}
    </Sheet>
  )
}

function SellBody({ titleId, card, busy, onClose, onList }) {
  const [copied, setCopied] = useState(null)
  const lines = listingLines(card.garment, card.size)

  async function copy() {
    const text = lines.map(([label, value]) => `${label}: ${value}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied('Copied')
    } catch {
      setCopied('Couldn’t copy. Select the lines instead.')
    }
  }

  return (
    <div className="sheet-body">
      <h2 id={titleId}>Sell the {garmentTitle(card.garment)}</h2>
      <div className="sell-check">
        <Swatch garment={card.garment} className="sell-thumb" />
        <dl className="sell-lines">
          {lines.slice(1).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="muted sell-copied" role="status">
        {copied}
      </p>
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={copy}>
          Copy listing
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={onList}
          data-autofocus
        >
          List it
        </button>
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
