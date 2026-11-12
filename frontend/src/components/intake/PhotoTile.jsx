import { API_URL } from '../../lib/api.js'
import {
  STILL_READING,
  photoQueued,
  photoReading,
} from '../../content/status.js'
import { BUDGET_WAITING } from '../../lib/intake.js'
import { useElapsed } from '../../lib/useElapsed.js'
import { STILL_WORKING_AFTER_S } from '../../lib/waits.js'

/**
 * What a photo's tile says, from its state on the server. `ahead` is how
 * many waiting photos are read before this one; `seconds` how long its
 * read has gone on.
 */
export function photoWords(photo, titles, budgetSpent, ahead = 0, seconds = 0) {
  switch (photo.state) {
    case 'uploaded':
      return budgetSpent ? BUDGET_WAITING : photoQueued(ahead)
    case 'reading':
      return photoReading(seconds)
    case 'read':
      return `${titles} read`
    case 'empty':
      return 'nothing read'
    case 'failed':
      return 'failed'
    default:
      return photo.state
  }
}

/**
 * One photo in Shoot's strip: its thumbnail and its true state on the
 * server (AC 4), so a reload shows exactly where each photo is. A failed
 * photo says why and offers Retry, which requeues that photo alone (AC 12).
 *
 * @param {object} props
 * @param {{id: string, state: string, error: string|null}} props.photo
 * @param {number} props.number Its place in the sitting, from 1.
 * @param {number} props.titles Entries read from it.
 * @param {boolean} props.budgetSpent Today's model budget is used up.
 * @param {number} [props.ahead] Waiting photos read before this one.
 * @param {boolean} [props.reading] The reader has this photo in flight: the
 *   server claimed it, though the sitting still shows it `uploaded`.
 * @param {(photo: object) => void} props.onRetry
 * @param {(photo: object) => void} [props.onRemove] Remove this photo, and
 *   the titles read from it, before the sitting is added.
 * @param {boolean} [props.busy] A removal is being saved.
 */
export default function PhotoTile({
  photo,
  number,
  titles,
  budgetSpent,
  ahead = 0,
  reading = false,
  onRetry,
  onRemove,
  busy = false,
}) {
  const shown = reading ? { ...photo, state: 'reading' } : photo
  const seconds = useElapsed(shown.state === 'reading')
  return (
    <li className={`intake-shot intake-shot-${shown.state}`}>
      <img
        src={`${API_URL}/api/intake/photos/${photo.id}/image`}
        alt={`Photo ${number}`}
        loading="lazy"
      />
      <span>{photoWords(shown, titles, budgetSpent, ahead, seconds)}</span>
      {shown.state === 'reading' && seconds >= STILL_WORKING_AFTER_S && (
        <span className="muted">{STILL_READING}</span>
      )}
      {photo.state === 'failed' && (
        <>
          {photo.error && <span className="muted">{photo.error}</span>}
          <button
            type="button"
            className="btn sm"
            aria-label={`Retry photo ${number}`}
            onClick={() => onRetry(photo)}
          >
            Retry
          </button>
        </>
      )}
      {onRemove && (
        <button
          type="button"
          className="btn sm ghost"
          aria-label={`Remove photo ${number}`}
          disabled={busy || shown.state === 'reading'}
          onClick={() => onRemove(photo)}
        >
          Remove
        </button>
      )}
    </li>
  )
}

/** A photo still uploading, or one the upload refused, before it has an id. */
export function PendingTile({ upload }) {
  return (
    <li className="intake-shot intake-shot-uploading">
      <span className="intake-shot-blank" aria-hidden="true" />
      <span>
        {upload.error ? `${upload.name}: ${upload.error}` : 'uploading…'}
      </span>
    </li>
  )
}
