import { useState } from 'react'

/**
 * One item's playthroughs, oldest first: number, started, finished,
 * outcome and the journal days its dates hold.
 *
 * Read-only on the public item page (signed in only); editable on the edit
 * page, where a run's dates can be corrected, a closed run deleted, and a
 * past finished run added. The status control is the only other writer
 * (`backend/playthroughs.py`), so the table never opens or closes a run.
 *
 * @param {object} props
 * @param {Array<{number: number, started_on: string|null, finished_on: string|null, paused_on: string|null, outcome: string|null, journal_days: number, journal_minutes: number}>} props.runs
 * @param {boolean} [props.editable]
 * @param {boolean} [props.busy] - A write is in flight; the controls wait.
 * @param {(number: number, changes: object) => void} [props.onEdit]
 * @param {(number: number) => void} [props.onDelete]
 * @param {(run: {started_on: string|null, finished_on: string|null}) => void} [props.onAdd]
 */
export default function PlaythroughTable({
  runs,
  editable = false,
  busy = false,
  onEdit,
  onDelete,
  onAdd,
}) {
  const sorted = [...runs].sort((a, b) => a.number - b.number)
  return (
    <div className="playthroughs">
      {sorted.length === 0 ? (
        <p className="muted">No playthroughs yet.</p>
      ) : (
        <div className="playthroughs-wrap">
          <table className="playthroughs-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Started</th>
                <th scope="col">Finished</th>
                <th scope="col">Outcome</th>
                <th scope="col">Journal</th>
                {editable && (
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sorted.map((run) =>
                editable ? (
                  <EditableRow
                    // Remount when the server's dates change, so the inputs
                    // start from what was saved.
                    key={`${run.number}-${run.started_on}-${run.finished_on}`}
                    run={run}
                    busy={busy}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ) : (
                  <tr key={run.number}>
                    <td className="mono">{run.number}</td>
                    <td>{formatDay(run.started_on)}</td>
                    <td>{formatDay(run.finished_on)}</td>
                    <td>{outcomeLabel(run)}</td>
                    <td>{journalText(run)}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
      {editable && <AddPast busy={busy} onAdd={onAdd} />}
    </div>
  )
}

function EditableRow({ run, busy, onEdit, onDelete }) {
  const [started, setStarted] = useState(run.started_on ?? '')
  const [finished, setFinished] = useState(run.finished_on ?? '')
  const open = run.outcome == null
  const changes = {}
  if (started !== (run.started_on ?? '')) changes.started_on = started || null
  if (!open && finished !== (run.finished_on ?? ''))
    changes.finished_on = finished || null
  const dirty = Object.keys(changes).length > 0
  return (
    <tr>
      <td className="mono">{run.number}</td>
      <td>
        <input
          type="date"
          aria-label={`Started, playthrough ${run.number}`}
          value={started}
          onChange={(event) => setStarted(event.target.value)}
        />
      </td>
      <td>
        {open ? (
          '—'
        ) : (
          <input
            type="date"
            aria-label={`Finished, playthrough ${run.number}`}
            value={finished}
            onChange={(event) => setFinished(event.target.value)}
          />
        )}
      </td>
      <td>{outcomeLabel(run)}</td>
      <td>{journalText(run)}</td>
      <td className="playthroughs-actions">
        {dirty && (
          <button
            type="button"
            disabled={busy}
            aria-label={`Save playthrough ${run.number}`}
            onClick={() => onEdit(run.number, changes)}
          >
            Save
          </button>
        )}
        {/* An open run leaves by status (Backlog drops it), not here. */}
        {!open && (
          <button
            type="button"
            className="danger"
            disabled={busy}
            aria-label={`Delete playthrough ${run.number}`}
            onClick={() => onDelete(run.number)}
          >
            Delete
          </button>
        )}
      </td>
    </tr>
  )
}

function AddPast({ busy, onAdd }) {
  const [adding, setAdding] = useState(false)
  const [started, setStarted] = useState('')
  const [finished, setFinished] = useState('')
  if (!adding) {
    return (
      <p className="playthroughs-add">
        <button
          type="button"
          className="link-button"
          onClick={() => setAdding(true)}
        >
          Add a past playthrough
        </button>
      </p>
    )
  }
  return (
    <div
      className="playthroughs-add-form"
      role="group"
      aria-label="Past playthrough"
    >
      <label>
        Started
        <input
          type="date"
          value={started}
          onChange={(event) => setStarted(event.target.value)}
        />
      </label>
      <label>
        Finished
        <input
          type="date"
          value={finished}
          onChange={(event) => setFinished(event.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          onAdd({ started_on: started || null, finished_on: finished || null })
          setAdding(false)
          setStarted('')
          setFinished('')
        }}
      >
        Add
      </button>
      <button type="button" onClick={() => setAdding(false)}>
        Cancel
      </button>
    </div>
  )
}

const DAY = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** "19 Oct 2026", or a dash for a date the run never had. */
export function formatDay(value) {
  return value ? DAY.format(new Date(`${value}T00:00:00Z`)) : '—'
}

/** What became of the run; an open one is Playing or Paused. */
export function outcomeLabel(run) {
  if (run.outcome === 'finished') return 'Finished'
  if (run.outcome === 'abandoned') return 'Abandoned'
  return run.paused_on ? 'Paused' : 'Playing'
}

/** "6 days · 11 h", "1 day · 40 min", "2 days", or a dash with none. */
export function journalText(run) {
  const days = run.journal_days ?? 0
  if (days === 0) return '—'
  const dayText = `${days} ${days === 1 ? 'day' : 'days'}`
  const minutes = run.journal_minutes ?? 0
  if (minutes === 0) return dayText
  const time = minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`
  return `${dayText} · ${time}`
}
