import { API_URL } from '../../lib/api.js'
import { BUDGET_WAITING } from '../../lib/intake.js'

/** What a photo's tile says, from its state on the server. */
export function photoWords(photo, titles, budgetSpent) {
  switch (photo.state) {
    case 'uploaded':
      return budgetSpent ? BUDGET_WAITING : 'queued'
    case 'reading':
      return 'reading…'
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
  onRetry,
  onRemove,
  busy = false,
}) {
  return (
    <li className={`intake-shot intake-shot-${photo.state}`}>
      <img
        src={`${API_URL}/api/intake/photos/${photo.id}/image`}
        alt={`Photo ${number}`}
        loading="lazy"
      />
      <span>{photoWords(photo, titles, budgetSpent)}</span>
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
          disabled={busy || photo.state === 'reading'}
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
