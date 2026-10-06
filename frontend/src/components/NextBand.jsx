import { Link } from 'react-router'
import { spine } from '../content/spine.js'
import { bandCounts } from '../lib/next.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'

/**
 * One line under the shelf's hero numbers linking across to What's next,
 * so the shelf still says the site is alive (Spine Next spec, C14). Hidden
 * when neither the snapshot nor the API has an answer.
 */
export default function NextBand() {
  const { data } = useSnapshotThenLive('next')
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
