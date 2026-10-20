import { Link } from 'react-router'
import { whenWords } from '../lib/nightly.js'

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
 * its state, and a link to where it can be run by hand.
 *
 * @param {object} props
 * @param {ReturnType<typeof import('../lib/nightly.js').nightlyJobs>[number]} props.job
 * @param {import('react').ReactNode} [props.extra] After the summary.
 */
export default function JobStatusRow({ job, extra }) {
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
      </span>
      <StatusText state={job.state} />
      {job.runNow ? (
        <Link to={job.runNow} className="job-run">
          Run now
          <span className="visually-hidden">{`: ${job.label}`}</span>
        </Link>
      ) : (
        <span />
      )}
    </li>
  )
}
