import { REENABLE_URL } from '../lib/adminJobs.js'
import { JOB_RUNS } from '../lib/nightly.js'
import JobStatusRow, { StatusText } from './JobStatusRow.jsx'
import { HEAD_STATUS, JOB_LIST } from './adminHomeClasses.js'
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
    <span role="status" className={`admin-head-status ${HEAD_STATUS}`}>
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
  const { jobs, loaded, reload } = nightly
  return (
    <Panel title="Nightly jobs" action={action}>
      {jobs ? (
        <ul className={`job-list ${JOB_LIST}`}>
          {jobs.map((job) => (
            <JobStatusRow
              key={job.key}
              job={job}
              run={JOB_RUNS[job.key]}
              onRan={reload}
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
