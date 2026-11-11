import { useEffect, useRef, useState } from 'react'
import {
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import CheckStep from '../components/intake/CheckStep.jsx'
import DetailsStep from '../components/intake/DetailsStep.jsx'
import DoneStep from '../components/intake/DoneStep.jsx'
import ShootStep from '../components/intake/ShootStep.jsx'
import SittingStepper from '../components/intake/SittingStepper.jsx'
import { LOAD_ERROR } from '../content/status.js'
import { apiFetch, errorMessage } from '../lib/api.js'
import {
  addPath,
  areaOfPath,
  localToday,
  WRITTEN_STATES,
} from '../lib/intake.js'

/** A sitting's steps: Details only when one of its kinds has one. */
function stepsFor(sitting, kinds) {
  const present = sitting.kind
    ? kinds.filter((kind) => kind.key === sitting.kind)
    : kinds.filter((kind) => kind.area === sitting.area)
  return present.some((kind) => kind.has_details)
    ? ['shoot', 'check', 'details', 'done']
    : ['shoot', 'check', 'done']
}

/**
 * One sitting (`/admin/collection/add/:sittingId`, and the Closet's): the
 * stepper, then Shoot, Check, Details (kinds that have one) and Done. The
 * step is saved on the sitting, so it reopens where it was left, on any
 * device (AC 3); moving a step moves focus to its heading.
 */
export default function AdminSitting() {
  const { sittingId } = useParams()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const context = useOutletContext() ?? {}
  const area = areaOfPath(pathname)
  const [sitting, setSitting] = useState(null)
  const [kinds, setKinds] = useState(null)
  const [budget, setBudget] = useState(null)
  const [failed, setFailed] = useState(null)
  const [step, setStep] = useState(null)
  const [answer, setAnswer] = useState(null)
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState(null)
  const [refusals, setRefusals] = useState({})
  const [starting, setStarting] = useState(false)
  const headingRef = useRef(null)
  const moved = useRef(false)

  useEffect(() => {
    let live = true
    Promise.all([
      apiFetch(`/api/intake/sittings/${sittingId}`),
      apiFetch('/api/intake/kinds'),
      apiFetch('/api/intake/budget'),
    ])
      .then(async ([sittingAnswer, kindsAnswer, budgetAnswer]) => {
        if (!sittingAnswer.ok) {
          const words =
            sittingAnswer.status === 404
              ? 'This sitting is gone: added or discarded, perhaps on another device.'
              : LOAD_ERROR
          if (live) setFailed(words)
          return
        }
        if (!kindsAnswer.ok) throw new Error('kinds')
        const [loaded, allKinds] = await Promise.all([
          sittingAnswer.json(),
          kindsAnswer.json(),
        ])
        const loadedBudget = budgetAnswer.ok ? await budgetAnswer.json() : null
        if (!live) return
        const steps = stepsFor(loaded, allKinds)
        setSitting(loaded)
        setKinds(allKinds)
        setBudget(loadedBudget)
        setStep(steps.includes(loaded.step) ? loaded.step : 'shoot')
      })
      .catch(() => {
        if (live) setFailed(LOAD_ERROR)
      })
    return () => {
      live = false
    }
  }, [sittingId])

  useEffect(() => {
    // Not on the first paint: the shell's route focus has that.
    if (!moved.current) return
    headingRef.current?.focus()
  }, [step])

  function goTo(next) {
    moved.current = true
    setStep(next)
    if (next === 'done') return
    // Best effort: the step is a convenience for the next device.
    apiFetch(`/api/intake/sittings/${sittingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: next }),
    }).catch(() => {})
  }

  function replaceEntry(entry) {
    setSitting((old) => ({
      ...old,
      entries: old.entries.map((e) => (e.id === entry.id ? entry : e)),
    }))
    context.refreshIntakeCounts?.()
  }

  async function commit() {
    setCommitting(true)
    setCommitError(null)
    setRefusals({})
    try {
      const response = await apiFetch(
        `/api/intake/sittings/${sittingId}/commit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ today: localToday() }),
        },
      )
      if (response.status === 422) {
        const body = await response.json()
        if (Array.isArray(body.refused)) {
          const byEntry = {}
          for (const refusal of body.refused) {
            byEntry[refusal.entry_id] = {
              ...byEntry[refusal.entry_id],
              [refusal.field ?? '']: refusal.message,
            }
          }
          setRefusals(byEntry)
          setCommitError(body.detail ?? 'Some rows need fixing first')
          return
        }
        setCommitError(
          typeof body.detail === 'string' ? body.detail : 'Refused',
        )
        return
      }
      if (!response.ok) {
        setCommitError(await errorMessage(response, { ownConflicts: true }))
        return
      }
      setAnswer(await response.json())
      context.refreshIntakeCounts?.()
      goTo('done')
    } catch {
      setCommitError('The server did not answer; try again.')
    } finally {
      setCommitting(false)
    }
  }

  async function nextBox() {
    setStarting(true)
    try {
      const response = await apiFetch('/api/intake/sittings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area: sitting.area, kind: sitting.kind }),
      })
      if (!response.ok) {
        setCommitError(await errorMessage(response, { ownConflicts: true }))
        return
      }
      const created = await response.json()
      navigate(`${addPath(area)}/${created.id}`)
    } catch {
      setCommitError('The server did not answer; try again.')
    } finally {
      setStarting(false)
    }
  }

  const kind = sitting && kinds?.find((k) => k.key === sitting.kind)
  const title = sitting?.label || 'Sitting'
  const steps = sitting && kinds ? stepsFor(sitting, kinds) : []
  const writable = sitting
    ? sitting.entries.filter((e) => WRITTEN_STATES.includes(e.state)).length
    : 0
  const target = area === 'closet' ? 'the closet' : 'the shelf'
  const commitAlert = commitError && (
    <p className="admin-error" role="alert">
      {commitError}
    </p>
  )

  return (
    <>
      <AdminPageHeader
        title={answer ? `${title} is in` : title}
        description={
          sitting
            ? `${kind?.label ?? (area === 'closet' ? 'Closet' : 'Mixed shelf')} sitting`
            : null
        }
      />
      {failed && (
        <p className="admin-error" role="alert">
          {failed}
        </p>
      )}
      {!sitting && !failed && (
        <p className="muted" role="status">
          Loading…
        </p>
      )}
      {sitting && step && (
        <>
          <SittingStepper steps={steps} current={step} />
          {step === 'shoot' && (
            <ShootStep
              sitting={sitting}
              onChange={setSitting}
              budget={budget}
              onNext={() => goTo('check')}
              headingRef={headingRef}
            />
          )}
          {step === 'check' && (
            <CheckStep
              sitting={sitting}
              onEntry={replaceEntry}
              headingRef={headingRef}
              nextBusy={committing}
              onNext={
                steps.includes('details') ? () => goTo('details') : commit
              }
              next={
                steps.includes('details') ? (
                  <>
                    Details <span aria-hidden="true">→</span>
                  </>
                ) : (
                  `Add ${writable} to ${target}`
                )
              }
              footer={commitAlert}
            />
          )}
          {step === 'details' && (
            <>
              {commitAlert}
              <DetailsStep
                sitting={sitting}
                kinds={kinds}
                onEntry={replaceEntry}
                refusals={refusals}
                onCommit={commit}
                onLater={() => navigate(addPath(area))}
                committing={committing}
                target={target}
                headingRef={headingRef}
              />
            </>
          )}
          {step === 'done' && answer && (
            <>
              {commitAlert}
              <DoneStep
                answer={answer}
                sitting={sitting}
                onNextBox={nextBox}
                startingNext={starting}
                headingRef={headingRef}
              />
            </>
          )}
        </>
      )}
    </>
  )
}
