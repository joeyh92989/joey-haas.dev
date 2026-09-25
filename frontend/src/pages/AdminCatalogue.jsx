import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import { apiFetch } from '../lib/api.js'

const KIND_ORDER = ['registry', 'store', 'platform', 'resolve']

const TOTAL_LABELS = [
  ['live_editions', 'Registry editions'],
  ['live_listings', 'Store listings'],
  ['cached_games', 'Games cached'],
  ['unresolved_keys', 'Not yet searched'],
  ['pending_keys', 'Needs match'],
  ['keys_without_platform', 'No platform'],
  ['disagreements', 'Disagreements'],
]

/** A response's error in words: the API's detail, else the status. */
async function errorWords(response) {
  if (response.status === 409) return 'A refresh is already running'
  try {
    const body = await response.json()
    if (typeof body.detail === 'string') return body.detail
  } catch {
    // Not JSON; the status says enough.
  }
  return `The server answered ${response.status}`
}

/** GET /status as {state, status, error}; the caller decides what to set. */
async function fetchStatus() {
  try {
    const response = await apiFetch('/api/physical/status')
    if (response.status === 401) return { state: 'unauthorized' }
    if (!response.ok)
      return { state: 'error', error: await errorWords(response) }
    return { state: 'ready', status: await response.json() }
  } catch {
    return {
      state: 'error',
      error: 'Could not reach the API. Try again shortly.',
    }
  }
}

function when(timestamp) {
  if (!timestamp) return 'never'
  const date = new Date(timestamp)
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/** A run's outcome in words, never a colour alone. */
export function runState(run) {
  if (!run) return 'never run'
  if (run.ok === null) return 'running'
  const errors = run.errors.filter((entry) => entry.code !== 'info').length
  const parts = [run.ok ? 'ok' : 'failed']
  if (run.short_run) parts.push('short run — nothing retired')
  if (errors) parts.push(`${errors} ${errors === 1 ? 'error' : 'errors'}`)
  return parts.join(', ')
}

function SourceRow({ source, busy, onRefreshStore }) {
  const run = source.last_run
  return (
    <tr>
      <th scope="row">
        {source.name}
        {source.needs_attention && (
          <span
            className="needs-attention"
            role="img"
            aria-label="Needs attention"
            title={`${source.consecutive_failures} failed runs in a row`}
          >
            !
          </span>
        )}
      </th>
      <td>{when(run?.finished_at ?? run?.started_at)}</td>
      <td>{run ? run.rows_seen : '—'}</td>
      <td>
        {runState(run)}
        {run?.errors?.length > 0 && (
          <ul className="run-errors">
            {run.errors.map((entry, index) => (
              <li key={index}>
                <code>{entry.code}</code> {entry.detail}
              </li>
            ))}
          </ul>
        )}
      </td>
      <td>
        {source.kind === 'store' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onRefreshStore(source.source)}
            aria-label={`Refresh ${source.name}`}
          >
            Refresh
          </button>
        )}
      </td>
    </tr>
  )
}

/**
 * The physical catalogue: where each source stands, and the presses that
 * refresh it. Every refresh is synchronous on the server, so a press can take
 * a minute; the buttons say what is running and stay disabled until it ends.
 * Resolve loops by itself until nothing is left to search, and stops on the
 * first error rather than hammering IGDB.
 */
export default function AdminCatalogue() {
  const { signedIn = false } = useOutletContext() ?? {}
  const [state, setState] = useState('loading')
  const [status, setStatus] = useState(null)
  const [running, setRunning] = useState(null)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const apply = useCallback((result) => {
    setState(result.state)
    if (result.status) setStatus(result.status)
    if (result.error) setError(result.error)
  }, [])

  const load = useCallback(async () => apply(await fetchStatus()), [apply])

  // Signing in on another tab flips signedIn; read the status again then.
  useEffect(() => {
    let live = true
    fetchStatus().then((result) => {
      if (live) apply(result)
    })
    return () => {
      live = false
    }
  }, [apply, signedIn])

  async function press(label, path, options = {}) {
    setRunning(label)
    setError(null)
    setMessage(null)
    try {
      const response = await apiFetch(path, { method: 'POST', ...options })
      if (!response.ok) {
        setError(await errorWords(response))
        return null
      }
      return await response.json()
    } catch {
      setError('Could not reach the API. Try again shortly.')
      return null
    } finally {
      setRunning(null)
      await load()
    }
  }

  async function refreshStores(stores) {
    const body = stores ? { stores } : {}
    const result = await press(
      stores ? `Refreshing ${stores.join(', ')}…` : 'Refreshing stores…',
      '/api/physical/refresh',
      {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )
    if (result) setMessage(`${result.unresolved_remaining} left to resolve`)
  }

  async function refreshRegistry() {
    const result = await press(
      'Refreshing the registry…',
      '/api/physical/refresh-registry',
    )
    if (result) {
      const synced = result.runs[0]?.items_synced ?? 0
      setMessage(
        `${synced} ${synced === 1 ? 'copy' : 'copies'} synced; ` +
          `${result.unresolved_remaining} left to resolve`,
      )
    }
  }

  async function refreshN64() {
    const run = await press(
      'Refreshing N64…',
      '/api/physical/refresh-platform?platform_id=4',
    )
    if (run) setMessage(`N64: ${run.rows_seen} games`)
  }

  async function resolveAll() {
    setError(null)
    setMessage(null)
    let remaining = null
    try {
      for (;;) {
        setRunning(
          remaining === null ? 'Resolving…' : `${remaining} remaining…`,
        )
        const response = await apiFetch('/api/physical/resolve', {
          method: 'POST',
        })
        if (!response.ok) {
          setError(await errorWords(response))
          return
        }
        const batch = await response.json()
        remaining = batch.unresolved_remaining
        if (batch.errors.length > 0) {
          setError(batch.errors.map((entry) => entry.detail).join('; '))
          return
        }
        if (remaining === 0) {
          setMessage('Everything is resolved')
          return
        }
        if (batch.resolved + batch.pending === 0) {
          setError(`Stopped with ${remaining} left: a batch changed nothing`)
          return
        }
      }
    } catch {
      setError('Could not reach the API. Try again shortly.')
    } finally {
      setRunning(null)
      await load()
    }
  }

  if (state === 'unauthorized') {
    return (
      <section>
        <h1>Catalogue</h1>
        <p>
          <Link to="/admin">Sign in</Link> to see the catalogue.
        </p>
      </section>
    )
  }

  const busy = running !== null
  const sources = status
    ? [...status.sources].sort(
        (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
      )
    : []

  return (
    <section className="catalogue">
      <h1>Catalogue</h1>
      <p className="muted">
        What exists physically, and as what: the r/NSCollectors registry, the
        boutique stores and IGDB&apos;s N64 list.
      </p>

      <div className="catalogue-actions">
        <button type="button" disabled={busy} onClick={() => refreshStores()}>
          Refresh stores
        </button>
        <button type="button" disabled={busy} onClick={refreshRegistry}>
          Refresh registry
        </button>
        <button type="button" disabled={busy} onClick={refreshN64}>
          Refresh N64
        </button>
        <button type="button" disabled={busy} onClick={resolveAll}>
          Resolve
        </button>
      </div>

      <p className="catalogue-progress" role="status" aria-live="polite">
        {running ?? message ?? ''}
      </p>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}

      {state === 'loading' && <p className="muted">Loading the catalogue…</p>}

      {status && (
        <>
          <dl className="catalogue-totals">
            {TOTAL_LABELS.map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{status.totals[key] ?? 0}</dd>
              </div>
            ))}
          </dl>

          <div className="item-table-wrap">
            <table className="item-table catalogue-table">
              <caption className="visually-hidden">Sources</caption>
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Last refreshed</th>
                  <th scope="col">Rows</th>
                  <th scope="col">State</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <SourceRow
                    key={source.source}
                    source={source}
                    busy={busy}
                    onRefreshStore={(key) => refreshStores([key])}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
