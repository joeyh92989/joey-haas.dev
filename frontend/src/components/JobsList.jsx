import { REENABLE_URL } from '../lib/adminJobs.js'
import { JOB_RUNS } from '../lib/nightly.js'
import { adminCopy } from '../content/adminCopy.js'
import JobStatusRow, { StatusText } from './JobStatusRow.jsx'
import {
  HEAD_STATUS,
  JOB_BODY,
  JOB_HEAD,
  JOB_HEAD_CELL,
  JOB_LIST,
  JOB_NOTE,
} from './adminHomeClasses.js'
import Panel from './Panel.jsx'

const copy = adminCopy.jobs

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
 * The link to the README's "how to re-enable it", marked as leaving the
 * site: it opens GitHub in a new tab.
 */
function ReenableLink() {
  return (
    <>
      {' · '}
      <a href={REENABLE_URL} target="_blank" rel="noopener noreferrer">
        how to re-enable it
        <span className="visually-hidden">
          , opens GitHub in a new tab
        </span>{' '}
        <span aria-hidden="true">↗</span>
      </a>
    </>
  )
}

/**
 * The nightly jobs as a table, one row each: what it does, when it last ran
 * and next runs, its state, and the way to switch the schedule back on
 * beside a catalogue row that says it may have stopped. Lives on the Jobs
 * page only; Home sums it up in the Site card.
 *
 * @param {object} props
 * @param {ReturnType<typeof import('../lib/adminJobs.js').useNightly>} props.nightly
 */
export default function JobsList({ nightly }) {
  const { jobs, loaded, reload, now } = nightly
  return (
    <Panel title={copy.nightly}>
      {jobs ? (
        <>
          <table role="table" className={`job-list ${JOB_LIST}`}>
            <caption className="sr-only">{copy.caption}</caption>
            <thead role="rowgroup" className={JOB_HEAD}>
              <tr role="row">
                {copy.columns.map((name) => (
                  <th
                    key={name}
                    scope="col"
                    role="columnheader"
                    className={JOB_HEAD_CELL}
                  >
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody role="rowgroup" className={JOB_BODY}>
              {jobs.map((job) => (
                <JobStatusRow
                  key={job.key}
                  job={job}
                  now={now}
                  run={JOB_RUNS[job.key]}
                  onRan={reload}
                  extra={job.stopped && <ReenableLink />}
                />
              ))}
            </tbody>
          </table>
          <p className={JOB_NOTE}>{copy.note}</p>
        </>
      ) : (
        <p className="muted">
          {loaded
            ? adminCopy.dashboard.nightlyUnread
            : 'Reading the nightly status…'}
        </p>
      )}
    </Panel>
  )
}
