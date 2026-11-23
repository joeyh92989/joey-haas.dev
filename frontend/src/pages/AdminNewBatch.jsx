import { useEffect, useRef, useState } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import LoadState from '../components/LoadState.jsx'
import { FILE_PICK } from '../components/closetClasses.js'
import { ibtn } from '../components/addClasses.js'
import {
  INTAKE_DROP,
  INTAKE_DROP_ACTIONS,
  INTAKE_DROP_TITLE,
  INTAKE_FILE,
} from '../components/intakeClasses.js'
import { adminCopy } from '../content/adminCopy.js'
import { apiFetch, errorMessage } from '../lib/api.js'
import { PHOTO_ACCEPT } from '../lib/closet.js'
import { stashFiles } from '../lib/intakeHandoff.js'
import {
  addPath,
  areaOfPath,
  hasHome,
  MIXED_KIND,
  refuseFile,
  sittingLabel,
} from '../lib/intake.js'

const copy = adminCopy.newBatch

/**
 * The page a kind's card on Add opens (`/admin/collection/add/new/:kind`, and
 * the Closet's). It has the Shoot step's pickers but no server record: the
 * batch is created when the first photo is chosen, and the photos go to its
 * page, which uploads them (#493). Looking and going Back saves nothing.
 */
export default function AdminNewBatch() {
  const { kind: segment } = useParams()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const context = useOutletContext() ?? {}
  const area = areaOfPath(pathname)
  const [kinds, setKinds] = useState(null)
  const [failed, setFailed] = useState(false)
  const [tries, setTries] = useState(0)
  const [error, setError] = useState(null)
  const [refusals, setRefusals] = useState([])
  const [busy, setBusy] = useState(false)
  const headingRef = useRef(null)

  useEffect(() => {
    let live = true
    apiFetch('/api/intake/kinds')
      .then(async (response) => {
        if (!response.ok) throw new Error('kinds')
        const list = await response.json()
        if (live) setKinds(list)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [tries])

  const kind =
    segment === 'mixed'
      ? MIXED_KIND
      : (kinds ?? []).find(
          (k) => k.key === segment && k.area === area && hasHome(k),
        )
  const canShoot = kind && kind.ways_in.includes('photo')

  async function picked(event) {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (files.length === 0 || !canShoot) return
    const refused = files.map(refuseFile).filter(Boolean)
    setRefusals(refused)
    const accepted = files.filter((file) => !refuseFile(file))
    if (accepted.length === 0) return
    setBusy(true)
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
      const created = await response.json()
      stashFiles(created.id, accepted)
      context.refreshIntakeCounts?.()
      navigate(`${addPath(area)}/${created.id}`, { replace: true })
    } catch {
      setError('The server did not answer; try again.')
    } finally {
      setBusy(false)
    }
  }

  const name = kind?.label ?? ''
  return (
    <>
      <AdminPageHeader
        title={kind ? copy.title(name) : adminCopy.add.title}
        description={kind ? copy.description : null}
      />
      {failed && (
        <LoadState
          failed
          onRetry={() => {
            setFailed(false)
            setTries((n) => n + 1)
          }}
        />
      )}
      {!kinds && !failed && (
        <p className="muted" role="status">
          {adminCopy.add.loading}
        </p>
      )}
      {kinds && !kind && (
        <p className="admin-error" role="alert">
          {copy.unknown}
        </p>
      )}
      {kinds && kind && !canShoot && <p className="muted">{copy.noPhotos}</p>}
      {canShoot && (
        <section aria-labelledby="new-batch-heading">
          <h2 id="new-batch-heading" ref={headingRef} className="kicker">
            {copy.heading}
          </h2>
          <div className={`intake-drop ${INTAKE_DROP}`}>
            <p className={`intake-drop-title ${INTAKE_DROP_TITLE}`}>
              {area === 'closet' ? copy.dropCloset : copy.dropShelf}
            </p>
            <p className="muted">{copy.nothingSaved}</p>
            <div className={`intake-drop-actions ${INTAKE_DROP_ACTIONS}`}>
              <label
                className={`${ibtn('primary')} ${FILE_PICK} intake-file ${INTAKE_FILE}`}
              >
                {busy ? copy.starting : copy.takePhotos}
                <input
                  type="file"
                  className="visually-hidden"
                  accept={PHOTO_ACCEPT}
                  capture="environment"
                  multiple
                  disabled={busy}
                  onChange={picked}
                />
              </label>
              <label
                className={`${ibtn('plain')} ${FILE_PICK} intake-file ${INTAKE_FILE}`}
              >
                {copy.chooseFiles}
                <input
                  type="file"
                  className="visually-hidden"
                  accept={PHOTO_ACCEPT}
                  multiple
                  disabled={busy}
                  onChange={picked}
                />
              </label>
              <Link className={ibtn('plain')} to={addPath(area)}>
                {copy.back}
              </Link>
            </div>
          </div>
          {refusals.length > 0 && (
            <div className="admin-error" role="alert">
              {refusals.map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
            </div>
          )}
          {error && (
            <p className="admin-error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
    </>
  )
}
