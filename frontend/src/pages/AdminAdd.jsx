import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import KindTile from '../components/intake/KindTile.jsx'
import UnfinishedList from '../components/intake/UnfinishedList.jsx'
import LoadState from '../components/LoadState.jsx'
import { adminCopy } from '../content/adminCopy.js'
import { apiFetch, errorMessage } from '../lib/api.js'
import {
  addPath,
  areaOfPath,
  hasHome,
  kindSegment,
  MIXED_KIND,
} from '../lib/intake.js'
import { INTAKE_KINDS } from '../components/intakeClasses.js'

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
  const [tries, setTries] = useState(0)
  const [error, setError] = useState(null)

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
  }, [area, tries])

  function retry() {
    setFailed(false)
    setTries((count) => count + 1)
  }

  const allAreaKinds = (kinds ?? []).filter((kind) => kind.area === area)
  // Only kinds with a list to find them again in (#493).
  const areaKinds = allAreaKinds.filter(hasHome)
  const photoKinds = areaKinds.filter((kind) => kind.ways_in.includes('photo'))
  const tiles = photoKinds.length > 1 ? [...areaKinds, MIXED_KIND] : areaKinds
  const byKey = Object.fromEntries(allAreaKinds.map((kind) => [kind.key, kind]))

  // A card opens the new-batch page. Nothing is saved until its first photo
  // (#493): a click, a look and Back leave no unfinished batch behind.
  function start(kind) {
    navigate(`${addPath(area)}/new/${kindSegment(kind)}`)
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
        title={adminCopy.add.title}
        description={
          area === 'closet'
            ? 'a batch: photograph pieces, one per photo'
            : 'a batch: one kind, many at once'
        }
      />
      {failed && <LoadState failed onRetry={retry} />}
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {!kinds && !failed && (
        <p className="muted" role="status">
          {adminCopy.add.loading}
        </p>
      )}
      {kinds && (
        <>
          <h2 className="kicker" id="intake-start">
            {adminCopy.add.startSitting}
          </h2>
          <div
            role="group"
            aria-labelledby="intake-start"
            className={`intake-kinds ${INTAKE_KINDS}`}
          >
            {tiles.map((kind) => (
              <KindTile key={kind.key ?? 'mixed'} kind={kind} onStart={start} />
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
