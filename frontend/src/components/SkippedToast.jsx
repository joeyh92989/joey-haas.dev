import { spine } from '../content/spine.js'

const copy = spine.next.tonight

/**
 * Where a card stood after "Not tonight": the dashed line saying so, and an
 * Undo that puts the card back. A status region, so the skip is announced.
 *
 * @param {object} props
 * @param {{item_id: string, title: string}} props.pick
 * @param {(pick: object) => void} props.onUndo
 */
export default function SkippedToast({ pick, onUndo }) {
  return (
    <li className="tonight-toast" role="status">
      <span>
        <strong>{pick.title}</strong> {copy.skipped}
      </span>
      <button
        type="button"
        className="btn ghost"
        data-tonight-undo={pick.item_id}
        onClick={() => onUndo(pick)}
      >
        {copy.undo}
      </button>
    </li>
  )
}
