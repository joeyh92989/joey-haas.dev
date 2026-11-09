import { useState } from 'react'
import { spine } from '../content/spine.js'
import { STALE_HOURS } from '../lib/nightly.js'
import { dayWords } from '../lib/releaseWords.js'

const copy = spine.status

const COUNT = new Intl.NumberFormat('en')

const TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
})

/**
 * The landing's proof row: when the catalogue last refreshed, how big it
 * is, how old Discover is, and that the picks are live.
 *
 * Renders nothing without a status, with no skeleton, so a landing with
 * neither the snapshot nor the API shows no empty strip.
 *
 * @param {{
 *   status: {refreshed_at: string|null, titles: number, platforms: number, stores_watched: number, listings: number}|null,
 *   next: {generated_at?: {discover: string|null}}|null,
 *   now?: number,
 * }} props
 */
export default function StatusStrip({ status, next, now }) {
  // Read once at mount, so a re-render never flips the dot.
  const [mountedAt] = useState(() => Date.now())
  if (!status) return null
  const at = now ?? mountedAt
  const refreshedAt = status.refreshed_at
    ? Date.parse(status.refreshed_at)
    : null
  const fresh =
    refreshedAt !== null && at - refreshedAt <= STALE_HOURS * 3600 * 1000
  const discover = next?.generated_at?.discover
  return (
    <dl className="tour-status" aria-label={copy.label}>
      <div>
        <dt>{copy.refreshed}</dt>
        <dd>
          <span
            className={`tour-status-dot ${fresh ? 'ok' : 'stale'}`}
            role="img"
            aria-label={fresh ? copy.fresh : copy.stale}
          >
            ●
          </span>{' '}
          {refreshedAt === null ? '—' : `${TIME.format(refreshedAt)} UTC`}
        </dd>
      </div>
      <div>
        <dt>{copy.catalogue}</dt>
        <dd>
          {COUNT.format(status.titles)} {copy.titles}
          <small>
            {status.platforms} {copy.platforms}
          </small>
        </dd>
      </div>
      <div>
        <dt>{copy.stores}</dt>
        <dd>
          {status.stores_watched}
          <small>
            {COUNT.format(status.listings)} {copy.listings}
          </small>
        </dd>
      </div>
      <div>
        <dt>{copy.picks}</dt>
        <dd>{copy.picksLive}</dd>
      </div>
      <div>
        <dt>{copy.discover}</dt>
        <dd>{discover ? dayWords(discover) : '—'}</dd>
      </div>
    </dl>
  )
}
