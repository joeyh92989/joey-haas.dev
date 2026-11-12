import {
  LOAD_ERROR,
  REFRESH_FAILED,
  SESSION_ENDED,
  STALE_COPY,
  TRY_AGAIN,
  WAKING,
} from '../content/status.js'
import { useElapsed } from '../lib/useElapsed.js'
import { SLOW_LOAD_AFTER_S } from '../lib/waits.js'

/**
 * The one status line for a read: waiting, failed, or (once data is there)
 * nothing. Pair it with `useSnapshotThenLive` or `useLiveRead`:
 * `<LoadState loading={!data && !failed} failed={failed} stale={!!data}
 * onRetry={retry} />`.
 *
 * - `loading` -- a read is in flight with nothing to show. Says "Loading…",
 *   then the WAKING line after `SLOW_LOAD_AFTER_S` seconds (`role="status"`).
 * - `failed` -- the read failed. With no `stale` data: `LOAD_ERROR` and a
 *   Try again button in a `role="alert"`. With `stale`: a quiet line and
 *   Try again, in a `role="status"`. The line is "Showing the last saved
 *   copy." for a snapshot painted before any live read, "Couldn't refresh."
 *   once `live` data has been on screen (or the page's `staleMessage`).
 * - `ended` -- the signed-in session is gone: SESSION_ENDED in a `role="alert"`
 *   and no Try again, which could not help.
 * - neither -- renders nothing.
 *
 * @param {object} props
 * @param {boolean} [props.loading]
 * @param {boolean} [props.failed]
 * @param {boolean} [props.stale] Older data is on screen despite the failure.
 * @param {boolean} [props.live] Live data (not only a snapshot) is on screen.
 * @param {string} [props.staleMessage] Overrides the stale line.
 * @param {boolean} [props.ended] The session ended; no Try again.
 * @param {() => void} [props.onRetry] Called by Try again.
 * @param {string} [props.message] A page's own failure words, shown instead
 *   of `LOAD_ERROR` when nothing is on screen (`stale` keeps its own line).
 * @param {string} [props.className]
 */
export default function LoadState({
  loading = false,
  failed = false,
  stale = false,
  live = false,
  staleMessage,
  ended = false,
  onRetry,
  message = LOAD_ERROR,
  className = '',
}) {
  const waiting = loading && !failed
  const seconds = useElapsed(waiting)
  const cls = `load-state ${className}`.trim()

  if (ended) {
    return (
      <div className={cls} role="alert">
        <p className="muted">{SESSION_ENDED}</p>
      </div>
    )
  }
  if (failed) {
    const staleLine = staleMessage ?? (live ? REFRESH_FAILED : STALE_COPY)
    return (
      <div
        className={`${cls}${stale ? ' stale' : ''}`}
        role={stale ? 'status' : 'alert'}
      >
        <p className="muted">{stale ? staleLine : message}</p>
        {onRetry && (
          <button type="button" className="btn sm" onClick={onRetry}>
            {TRY_AGAIN}
          </button>
        )}
      </div>
    )
  }
  if (waiting) {
    return (
      <p className={`${cls} muted`} role="status">
        {seconds >= SLOW_LOAD_AFTER_S ? WAKING : 'Loading…'}
      </p>
    )
  }
  return null
}
