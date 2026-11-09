import { REENABLE_URL } from '../lib/adminJobs.js'
import JobStatusRow, { StatusText } from './JobStatusRow.jsx'
import Panel from './Panel.jsx'

/**
 * The header's status line: the API's state and the nightly headline. A
 * live region, so a change after load is read out.
 *
 * @param {object} props
 * @param {ReturnType<typeof import('../lib/adminJobs.js').useNightly>} props.nightly
 */
export function NightlyStatus({ nightly }) {
  const { api, headline } = nightly
  return (
    <span role="status" className="admin-head-status">
      <StatusText state={api.state}>{api.words}</StatusText>
      {headline && (
        <StatusText state={headline.state}>{headline.words}</StatusText>
      )}
    </span>
  )
}

/**
 * The nightly jobs, one row each, with the way to switch the schedule back
 * on beside a catalogue row that says it may have stopped.
 *
 * @param {object} props
 * @param {ReturnType<typeof import('../lib/adminJobs.js').useNightly>} props.nightly
 * @param {import('react').ReactNode} [props.action] A link in the header bar.
 */
export default function JobsList({ nightly, action }) {
  const { jobs, loaded } = nightly
  return (
    <Panel title="Nightly jobs" action={action}>
      {jobs ? (
        <ul className="job-list">
          {jobs.map((job) => (
            <JobStatusRow
              key={job.key}
              job={job}
              extra={
                job.stopped && (
                  <>
                    {' · '}
                    <a href={REENABLE_URL}>how to re-enable it</a>
                  </>
                )
              }
            />
          ))}
        </ul>
      ) : (
        <p className="muted">
          {loaded
            ? 'The nightly status couldn’t be read.'
            : 'Reading the nightly status…'}
        </p>
      )}
    </Panel>
  )
}
