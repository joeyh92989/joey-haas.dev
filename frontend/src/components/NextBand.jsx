import { Link } from 'react-router'
import { spine } from '../content/spine.js'
import { bandCounts } from '../lib/next.js'

/**
 * One line under the shelf's hero numbers linking across to What's next,
 * so the shelf still says the site is alive (Spine Next spec, C14). Hidden
 * when neither the snapshot nor the API has an answer.
 *
 * The landing reads What's next once and passes it here and to the status
 * strip, so a visit makes one request for it, not two.
 *
 * @param {{next: object|null}} props What's next's body, or null.
 */
export default function NextBand({ next: data }) {
  if (!data) return null
  const { tonight, toBuy, preorders } = bandCounts(data)
  const band = spine.next.band
  const parts = [
    tonight && `${band.tonight} ${tonight}`,
    `${toBuy} ${band.toBuy}`,
    `${preorders} ${band.preorders}`,
  ].filter(Boolean)
  return (
    <p className="next-band">
      <Link to={spine.next.path}>
        <strong>{band.lead}</strong> <span aria-hidden="true">&rarr;</span>{' '}
        {parts.join(' · ')}
      </Link>
    </p>
  )
}
