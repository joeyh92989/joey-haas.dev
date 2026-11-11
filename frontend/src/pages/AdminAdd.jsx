import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import KindTile from '../components/intake/KindTile.jsx'
import UnfinishedList from '../components/intake/UnfinishedList.jsx'
import { LOAD_ERROR } from '../content/status.js'
import { apiFetch, errorMessage } from '../lib/api.js'
import { addPath, areaOfPath } from '../lib/intake.js'

/** The mixed shelf: one sitting, and the reader sorts each title's kind. */
const MIXED = {
  key: null,
  label: 'Mixed shelf',
  ways_in: ['photo'],
  note: 'the reader sorts each title',
}

/** A default name for a new sitting: its kind and the day. */
function sittingLabel(kind, now = new Date()) {
  const day = now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  return `${kind.label} · ${day}`
}

/**
 * An area's Add page (`/admin/collection/add`, `/admin/closet/add`): a tile
 * per kind the server registers for the area, each listing its ways in,
 * and the area's unfinished sittings with Resume and Discard. It replaces
 * Import photos. Everything here comes from the API, so a kind registered
 * on the server appears with no change to this page (AC 9).
 */
export default function AdminAdd() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const context = useOutletContext() ?? {}
  const area = areaOfPath(pathname)
  const [kinds, setKinds] = useState(null)
  const [sittings, setSittings] = useState(null)
  const [failed, setFailed] = useState(false)
  const [error, setError] = useState(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    let live = true
    Promise.all([
      apiFetch('/api/intake/kinds'),
      apiFetch(`/api/intake/sittings?area=${area}`),
    ])
      .then(async ([kindsAnswer, sittingsAnswer]) => {
        if (!kindsAnswer.ok || !sittingsAnswer.ok) throw new Error('load')
        const [allKinds, list] = await Promise.all([
          kindsAnswer.json(),
          sittingsAnswer.json(),
        ])
        if (!live) return
        setKinds(allKinds)
        setSittings(list)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [area])

  const areaKinds = (kinds ?? []).filter((kind) => kind.area === area)
  const photoKinds = areaKinds.filter((kind) => kind.ways_in.includes('photo'))
  const tiles = photoKinds.length > 1 ? [...areaKinds, MIXED] : areaKinds
  const byKey = Object.fromEntries(areaKinds.map((kind) => [kind.key, kind]))

  async function start(kind) {
    setStarting(true)
    setError(null)
    try {
      const response = await apiFetch('/api/intake/sittings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          area,
          kind: kind.key,
          label: sittingLabel(kind),
        }),
      })
      if (!response.ok) {
        setError(await errorMessage(response, { ownConflicts: true }))
        return
      }
      const sitting = await response.json()
      navigate(`${addPath(area)}/${sitting.id}`)
    } catch {
      setError('The server did not answer; try again.')
    } finally {
      setStarting(false)
    }
  }

  async function discard(sitting) {
    setError(null)
    try {
      const response = await apiFetch(`/api/intake/sittings/${sitting.id}`, {
        method: 'DELETE',
      })
      if (!response.ok && response.status !== 404) {
        setError(await errorMessage(response, { ownConflicts: true }))
        return
      }
      setSittings((old) => old.filter((s) => s.id !== sitting.id))
      context.refreshIntakeCounts?.()
    } catch {
      setError('The server did not answer; try again.')
    }
  }

  return (
    <>
      <AdminPageHeader
        title="Add"
        description={
          area === 'closet'
            ? 'a sitting: photograph pieces, one per photo'
            : 'a sitting: one kind, many at once'
        }
      />
      {failed && (
        <p className="admin-error" role="alert">
          {LOAD_ERROR}
        </p>
      )}
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {!kinds && !failed && (
        <p className="muted" role="status">
          Loading…
        </p>
      )}
      {kinds && (
        <>
          <h2 className="kicker" id="intake-start">
            Start a sitting
          </h2>
          <div
            role="group"
            aria-labelledby="intake-start"
            className="intake-kinds"
          >
            {tiles.map((kind) => (
              <KindTile
                key={kind.key ?? 'mixed'}
                kind={kind}
                onStart={start}
                busy={starting}
              />
            ))}
          </div>
          <h2 className="kicker">
            Unfinished{sittings?.length ? ` · ${sittings.length}` : ''}
          </h2>
          <UnfinishedList
            sittings={sittings ?? []}
            kinds={byKey}
            base={addPath(area)}
            onDiscard={discard}
          />
        </>
      )}
    </>
  )
}
