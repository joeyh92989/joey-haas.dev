import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import JobStatusRow, { StatusText } from '../components/JobStatusRow.jsx'
import Panel from '../components/Panel.jsx'
import StatTile, { StatTiles } from '../components/StatTile.jsx'
import { counted } from '../lib/analytics.js'
import { apiFetch } from '../lib/api.js'
import { dashboardCounts, recentChanges } from '../lib/dashboard.js'
import {
  lastNightly,
  nightlyHeadline,
  nightlyJobs,
  whenWords,
} from '../lib/nightly.js'
import { readSnapshot } from '../lib/snapshot.js'

/** The README section that says how to switch the schedule back on. */
const REENABLE_URL = 'https://github.com/joeyh92989/joey-haas.dev#nightly-job'

/** The API's state in the header, as a status and its words. */
const API_WORDS = {
  checking: { state: 'unknown', words: 'Checking the API' },
  awake: { state: 'ok', words: 'API awake' },
  'signed-out': {
    state: 'failed',
    words: 'Your session ended. Reload to sign in.',
  },
  error: { state: 'failed', words: 'API error' },
  unreachable: { state: 'failed', words: 'API unreachable' },
}

/** What a status answer says about the API, as a key of API_WORDS. */
function apiState(response) {
  if (response.ok) return 'awake'
  if (response.status === 401 || response.status === 403) return 'signed-out'
  return 'error'
}

/** Radar's and Discover's generate times from the store list, or nulls. */
async function generatedAt(response) {
  const none = { radar: null, discover: null }
  if (!response?.ok) return none
  try {
    const body = await response.json()
    return {
      radar: body?.generated_at?.radar ?? null,
      discover: body?.generated_at?.discover ?? null,
    }
  } catch {
    return none
  }
}

/**
 * The catalogue status, the generate times and the snapshot's build time.
 * Never rejects. A status that cannot be read leaves `status` null, and the
 * jobs panel says so rather than reading as a stopped schedule.
 */
async function loadNightly() {
  const meta = readSnapshot('meta')
  let api = 'unreachable'
  let status = null
  let generated = { radar: null, discover: null }
  try {
    const response = await apiFetch('/api/physical/status')
    // Any answer means the server is up; only a failed request is unreachable.
    api = apiState(response)
    if (response.ok) {
      const body = await response.json().catch(() => null)
      // Not a status document: no jobs rather than "may have stopped".
      if (Array.isArray(body?.sources)) {
        status = body
        generated = await generatedAt(
          await apiFetch('/api/recommendations/store-list').catch(() => null),
        )
      }
    }
  } catch {
    // Unreachable API: the header says so; the tiles and links still work.
  }
  return { api, status, generated, snapshotAt: (await meta)?.fetched_at }
}

/**
 * The last seven days' views and visitors, or null when they cannot be
 * read. Never rejects: the tile shows a dash rather than failing the page.
 */
async function loadViews() {
  try {
    const response = await apiFetch('/api/analytics?range=7d')
    if (!response.ok) return null
    const body = await response.json()
    return typeof body?.views === 'number' ? body : null
  } catch {
    return null
  }
}

/**
 * The admin landing, at /admin: the API and nightly state, four headline
 * figures, the nightly jobs, quick actions and the newest changes.
 * AdminLayout has already checked the session and loads the rows.
 */
export default function Admin() {
  const { items } = useOutletContext() ?? {}
  const [nightly, setNightly] = useState(null)
  // One clock for the visit, so ages and the year agree across renders.
  const [now] = useState(() => Date.now())

  // undefined while loading; null when the read failed.
  const [views, setViews] = useState(undefined)

  useEffect(() => {
    let live = true
    loadNightly().then((loaded) => {
      if (live) setNightly(loaded)
    })
    loadViews().then((loaded) => {
      if (live) setViews(loaded)
    })
    return () => {
      live = false
    }
  }, [])

  const year = new Date(now).getUTCFullYear()
  const counts = items ? dashboardCounts(items, year) : null
  const jobs = nightly?.status
    ? nightlyJobs(
        lastNightly(nightly.status, nightly.generated, now),
        nightly.snapshotAt ?? null,
        now,
      )
    : null
  const headline = jobs ? nightlyHeadline(jobs) : null
  const api = API_WORDS[nightly?.api ?? 'checking']
  const pending = nightly?.status?.totals?.pending_keys
  const changes = items ? recentChanges(items, jobs ?? []) : []

  return (
    <section className="dashboard">
      <AdminPageHeader title="Dashboard">
        <span role="status" className="admin-head-status">
          <StatusText state={api.state}>{api.words}</StatusText>
          {headline && (
            <StatusText state={headline.state}>{headline.words}</StatusText>
          )}
        </span>
      </AdminPageHeader>

      <StatTiles label="Dashboard figures">
        <StatTile
          label="Owned"
          value={counts ? counts.owned : '—'}
          detail={
            counts &&
            `${counts.ownedPublic} public · ${counts.ownedHidden} hidden`
          }
        />
        <StatTile
          label={`Finished · ${year}`}
          value={counts ? counts.finishedThisYear : '—'}
          detail={
            counts &&
            `${counts.finished} all time${
              counts.averageRating === null
                ? ''
                : ` · avg ${counts.averageRating.toFixed(1)}`
            }`
          }
        />
        <StatTile
          label="Needs attention"
          value={typeof pending === 'number' ? pending : '—'}
          detail="catalog rows need a match"
        />
        <StatTile
          label="Views · 7 days"
          value={views ? views.views : '—'}
          detail={
            views
              ? counted(views.visitors, 'visitor')
              : views === null && 'Couldn’t be read'
          }
        />
      </StatTiles>

      <div className="dashboard-two">
        <Panel title="Nightly jobs">
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
              {nightly
                ? 'The nightly status could not be read.'
                : 'Reading the nightly status…'}
            </p>
          )}
        </Panel>

        <Panel title="Quick actions" className="quick-actions">
          <Link to="/admin/import">
            Import photos<small>Read a shelf, then review</small>
          </Link>
          <Link to="/admin/store-list">
            Store list<small>What to look for in person</small>
          </Link>
          <Link to="/admin/collection">
            Add a game<small>Title, platform, copy format</small>
          </Link>
          <Link to="/admin/discover">
            Rate a few
            <small>
              {counts ? `${counts.unrated} finished, unrated` : 'On Discover'}
            </small>
          </Link>
        </Panel>
      </div>

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
