import { Link, useOutletContext } from 'react-router'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import JobsList, { NightlyStatus } from '../components/JobsList.jsx'
import Panel from '../components/Panel.jsx'
import { useNightly } from '../lib/adminJobs.js'
import { recentChanges } from '../lib/dashboard.js'
import { whenWords } from '../lib/nightly.js'

/**
 * Jobs, at /admin/jobs: the API and nightly state, every nightly job with
 * its last run, and the newest edits and runs. Listed under Home and Site.
 */
export default function AdminJobs() {
  const { items } = useOutletContext() ?? {}
  const nightly = useNightly()
  const changes = items ? recentChanges(items, nightly.jobs ?? []) : []

  return (
    <section className="dashboard">
      <AdminPageHeader title="Jobs">
        <NightlyStatus nightly={nightly} />
      </AdminPageHeader>

      <JobsList nightly={nightly} />

      <Panel
        title="Recent changes"
        action={
          <Link to="/admin/collection">
            Shelf <span aria-hidden="true">→</span>
          </Link>
        }
      >
        {changes.length ? (
          <div className="item-table-wrap">
            <table className="item-table recent-table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Change</th>
                  <th scope="col">When</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((change) => (
                  <tr key={change.key}>
                    <td>
                      <Link to={change.to}>{change.title}</Link>
                    </td>
                    <td>{change.change}</td>
                    <td className="job-when">{whenWords(change.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{items ? 'Nothing yet.' : 'Loading…'}</p>
        )}
      </Panel>
    </section>
  )
}
