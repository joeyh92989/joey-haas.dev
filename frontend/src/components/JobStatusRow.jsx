import { Link } from 'react-router'
import { adminCopy } from '../content/adminCopy.js'
import { whenWords } from '../lib/nightly.js'
import { useJobRun } from '../lib/useJobRun.js'

const copy = adminCopy.jobRun

/**
 * A status as a dot and a word, never the dot alone: the word carries the
 * state, and failed is squared, so it differs from stale in shape too.
 *
 * @param {object} props
 * @param {'ok'|'stale'|'failed'|'unknown'} props.state
 * @param {import('react').ReactNode} [props.children] The words; the state
 *   itself when omitted.
 */
export function StatusText({ state, children }) {
  return (
    <span className="status-text">
      <span className={`status-dot ${state}`} aria-hidden="true" />
      {children ?? state}
    </span>
  )
}

/**
 * One nightly job in the Dashboard's panel: when it last ran, what it is,
 * its state, and a link to the page that shows it ("Open Radar"). The link
 * only navigates. A job given `run` also has a "Run now" button that starts
 * it from the row, with the link kept beside it.
 *
 * @param {object} props
 * @param {ReturnType<typeof import('../lib/nightly.js').nightlyJobs>[number]} props.job
 * @param {import('react').ReactNode} [props.extra] After the summary.
 * @param {{path: string, body?: object}} [props.run] The job's start call.
 * @param {() => void} [props.onRan] Called after a run ends, to read the
 *   status again.
 */
export default function JobStatusRow({ job, extra, run, onRan }) {
  if (run)
    return <RunnableRow job={job} extra={extra} run={run} onRan={onRan} />
  return <RowBody job={job} extra={extra} />
}

/** The row with its run state, which lives here and not in the list. */
function RunnableRow({ job, extra, run, onRan }) {
  const control = useJobRun({
    path: run.path,
    body: run.body,
    onSettled: onRan,
  })
  return <RowBody job={job} extra={extra} control={control} />
}

function RowBody({ job, extra, control }) {
  const words = job.runWords ?? `Open ${job.label}`
  const running = control?.state === 'running'
  return (
    <li className="job-row">
      <span className="job-when">
        {job.at === null ? '—' : whenWords(job.at)}
      </span>
      <span className="job-text">
        <span className="job-label">{job.label}</span>
        <span className="job-summary">
          {job.summary}
          {extra}
        </span>
        {control && <JobResult control={control} />}
      </span>
      <StatusText state={job.state}>{job.stateWords}</StatusText>
      {job.runNow || control ? (
        <span className="job-actions">
          {control && (
            <button
              type="button"
              className="job-run job-run-button"
              disabled={running}
              aria-busy={running}
              onClick={control.start}
            >
              {running ? copy.running : copy.run}
              <span className="visually-hidden">{`: ${job.label}`}</span>
            </button>
          )}
          {job.runNow && (
            <Link to={job.runNow} className="job-run">
              {words}
              {!words.includes(job.label) && (
                <span className="visually-hidden">{`: ${job.label}`}</span>
              )}
            </Link>
          )}
        </span>
      ) : (
        <span />
      )}
    </li>
  )
}

/**
 * A run's result. Running and Done are polite status text in a region that
 * is always present, so a change is read out; a failure is an alert.
 */
function JobResult({ control }) {
  const { state, error, at } = control
  const conflict = error === copy.conflict
  return (
    <>
      <span role="status" className="job-result">
        {state === 'running' && copy.running}
        {state === 'done' && `${copy.done}, ${whenWords(at)}`}
      </span>
      {state === 'failed' && (
        <span role="alert" className="job-result failed">
          {conflict ? error : `${copy.failed}: ${error}`}
        </span>
      )}
    </>
  )
}
