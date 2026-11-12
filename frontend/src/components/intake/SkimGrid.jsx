import { WRITTEN_STATES, entryCover, entryTitle } from '../../lib/intake.js'
import CoverImage from '../CoverImage.jsx'
import ConfidenceBadge from './ConfidenceBadge.jsx'

/**
 * Whether an entry belongs in the skim grid: an exact match, a searched or
 * typed title (`ready`, `typed`), one already owned, or one unticked here
 * (kept as `ignored` with a note of what it was, so a reload or a second
 * device shows it unticked, not gone).
 */
export function inSkim(entry) {
  return (
    [...WRITTEN_STATES, 'owned'].includes(entry.state) ||
    (entry.state === 'ignored' && entry.payload?.unticked === true)
  )
}

/**
 * The exact matches as a grid to skim, not a tap each (spec D4): a
 * ticked checkbox per cover, labelled by its title; untick to drop one.
 * What is already on the shelf is dimmed, unticked and cannot be ticked.
 *
 * @param {object} props
 * @param {object[]} props.entries Entries for which `inSkim` holds.
 * @param {(entry: object, ticked: boolean) => void} props.onToggle
 * @param {(entry: object) => void} [props.onRemove] Take a title out of the
 *   sitting for good (unlike untick, which can be undone).
 * @param {boolean} [props.busy]
 */
export default function SkimGrid({
  entries,
  onToggle,
  onRemove,
  busy = false,
}) {
  if (!entries.length) return null
  return (
    <ul className="intake-skim">
      {entries.map((entry) => {
        const owned = entry.state === 'owned'
        const ticked = WRITTEN_STATES.includes(entry.state)
        const shown =
          entry.state === 'ignored' ? entry.payload?.was : entry.state
        return (
          <li key={entry.id} className={owned ? 'owned' : undefined}>
            <label>
              <CoverImage src={entryCover(entry)} type={entry.kind} />
              <span className="intake-skim-name">
                <input
                  type="checkbox"
                  checked={ticked}
                  disabled={owned}
                  onChange={(event) => onToggle(entry, event.target.checked)}
                />{' '}
                {entryTitle(entry)}
              </span>
            </label>
            <ConfidenceBadge state={shown} />
            {onRemove && (
              <button
                type="button"
                className="btn sm ghost"
                aria-label={`Remove ${entryTitle(entry)}`}
                disabled={busy}
                onClick={() => onRemove(entry)}
              >
                Remove
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
