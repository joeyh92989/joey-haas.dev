import { spine } from '../content/spine.js'
import {
  TONIGHT_BTN,
  TONIGHT_TOAST,
  TONIGHT_TOAST_LIST,
} from './tonightClasses.js'

const copy = spine.next.tonight

/**
 * Where a card stood after "Not tonight": the dashed line saying so, and an
 * Undo that puts the card back. Tonight announces the skip through its own
 * status region: one inserted already holding its text is often not read.
 *
 * @param {object} props
 * @param {{item_id: string, title: string}} props.pick
 * @param {(pick: object) => void} props.onUndo
 * @param {boolean} [props.inList] - It stands as a row of the compact list.
 */
export default function SkippedToast({ pick, onUndo, inList = false }) {
  return (
    <li
      className={`tonight-toast ${inList ? TONIGHT_TOAST_LIST : TONIGHT_TOAST}`}
    >
      <span>
        <strong>{pick.title}</strong> {copy.skipped}
      </span>
      <button
        type="button"
        className={`btn ghost ${TONIGHT_BTN}`}
        data-tonight-undo={pick.item_id}
        onClick={() => onUndo(pick)}
      >
        {copy.undo}
        <span className="visually-hidden">: {pick.title}</span>
      </button>
    </li>
  )
}
