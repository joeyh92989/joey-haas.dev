import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import MetadataPicker from '../components/MetadataPicker.jsx'
import { apiFetch, errorMessage } from '../lib/api.js'

const KIND_ORDER = ['registry', 'store', 'platform', 'resolve']

// Mirrors FORMAT_WORDS in backend/physical_sources/limits.py.
const FORMAT_WORDS = {
  game_card: 'full game on cartridge',
  game_key_card: 'Game-Key Card',
  code_in_box: 'code in a box',
  disc: 'disc',
}

// The catalogue's platforms; a platform-less key is given one of these.
const PLATFORM_CHOICES = [
  [508, 'Nintendo Switch 2'],
  [130, 'Nintendo Switch'],
  [4, 'Nintendo 64'],
]

async function getJson(path) {
  const response = await apiFetch(path)
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json()
}

const TOTAL_LABELS = [
  ['live_editions', 'Registry editions'],
  ['live_listings', 'Store listings'],
  ['cached_games', 'Games cached'],
  ['unresolved_keys', 'Not yet searched'],
  ['pending_keys', 'Needs match'],
  ['keys_without_platform', 'No platform'],
  ['disagreements', 'Disagreements'],
]

/** GET /status as {state, status, error}; the caller decides what to set. */
async function fetchStatus() {
  try {
    const response = await apiFetch('/api/physical/status')
    if (response.status === 401) return { state: 'unauthorized' }
    if (!response.ok)
      return { state: 'error', error: await errorMessage(response) }
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

function candidateLabel(candidate) {
  return candidate.year
    ? `${candidate.title} (${candidate.year})`
    : candidate.title
}

/** One key a human has to decide: link, ignore, or give it a platform. */
function NeedsMatchRow({ entry, onDecide }) {
  const [platform, setPlatform] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const where = entry.platform ?? 'No platform'

  async function decide(action) {
    setBusy(true)
    setError(null)
    const problem = await onDecide(entry, action)
    if (problem) {
      setError(problem)
      setBusy(false)
    }
  }

  return (
    <li className="needs-match-row">
      <p>
        <strong>{entry.title}</strong>{' '}
        <span className="muted">
          {where} · {entry.sources.join(', ')} · {entry.rows}{' '}
          {entry.rows === 1 ? 'row' : 'rows'}
        </span>
      </p>
      {entry.platform_id === 0 ? (
        <p className="needs-match-controls">
          <label>
            Platform{' '}
            <select
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
              aria-label={`Platform for ${entry.title}`}
            >
              <option value="">Choose…</option>
              {PLATFORM_CHOICES.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !platform}
            onClick={() => decide({ new_platform_id: Number(platform) })}
          >
            Set platform
          </button>
        </p>
      ) : (
        <>
          {entry.candidates.length > 0 && (
            <ul className="needs-match-candidates">
              {entry.candidates.map((candidate) => (
                <li key={candidate.external_id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      decide({ igdb_id: Number(candidate.external_id) })
                    }
                  >
                    Link {candidateLabel(candidate)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <MetadataPicker
            type="game"
            onSelect={(candidate) =>
              decide({ igdb_id: Number(candidate.external_id) })
            }
          />
        </>
      )}
      <p>
        <button
          type="button"
          disabled={busy}
          onClick={() => decide({ ignored: true })}
          aria-label={`Ignore ${entry.title}`}
        >
          Ignore
        </button>
      </p>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

/** Keys searched without a sure match, or sold with no platform. */
function NeedsMatch({ onChange }) {
  const [state, setState] = useState({ status: 'loading', keys: [], total: 0 })

  useEffect(() => {
    let live = true
    getJson('/api/physical/needs-match')
      .then((body) => {
        if (live) setState({ status: 'ready', ...body })
      })
      .catch((error) => {
        if (live) setState({ status: 'error', keys: [], error: error.message })
      })
    return () => {
      live = false
    }
  }, [])

  async function decide(entry, action) {
    try {
      const response = await apiFetch('/api/physical/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title_normalized: entry.title_normalized,
          platform_id: entry.platform_id,
          ...action,
        }),
      })
      if (!response.ok) return await errorMessage(response)
    } catch {
      return 'Could not reach the API. Try again shortly.'
    }
    // Decided rows leave the list here; nothing is reloaded.
    setState((current) => ({
      ...current,
      keys: current.keys.filter(
        (key) =>
          key.title_normalized !== entry.title_normalized ||
          key.platform_id !== entry.platform_id,
      ),
      total: current.total - 1,
    }))
    onChange()
    return null
  }

  return (
    <section className="needs-match" aria-labelledby="needs-match-heading">
      <h2 id="needs-match-heading">Needs match</h2>
      {state.status === 'loading' && <p className="muted">Loading…</p>}
      {state.status === 'error' && (
        <p className="admin-error" role="alert">
          {state.error}
        </p>
      )}
      {state.status === 'ready' && state.keys.length === 0 && (
        <p className="muted">Nothing needs a match.</p>
      )}
      {state.status === 'ready' && state.total > state.keys.length && (
        <p className="muted">
          Showing {state.keys.length} of {state.total}.
        </p>
      )}
      <ul className="needs-match-list">
        {state.keys.map((entry) => (
          <NeedsMatchRow
            key={`${entry.title_normalized}:${entry.platform_id}`}
            entry={entry}
            onDecide={decide}
          />
        ))}
      </ul>
    </section>
  )
}

/** Copies whose recorded format the registry contradicts. */
function Disagreements() {
  const [state, setState] = useState({ status: 'loading', items: [] })

  useEffect(() => {
    let live = true
    getJson('/api/physical/disagreements')
      .then((body) => {
        if (live) setState({ status: 'ready', items: body.items })
      })
      .catch((error) => {
        if (live) setState({ status: 'error', items: [], error: error.message })
      })
    return () => {
      live = false
    }
  }, [])

  return (
    <section className="disagreements" aria-labelledby="disagreements-heading">
      <h2 id="disagreements-heading">Registry disagreements</h2>
      {state.status === 'error' && (
        <p className="admin-error" role="alert">
          {state.error}
        </p>
      )}
      {state.status === 'ready' && state.items.length === 0 && (
        <p className="muted">No copy disagrees with the registry.</p>
      )}
      <ul className="disagreement-list">
        {state.items.map((item) => (
          <li key={item.item_id}>
            <Link to={`/admin/collection/${item.item_id}`}>{item.title}</Link>{' '}
            <span className="muted">({item.region})</span>
            <p>
              Yours: {FORMAT_WORDS[item.yours] ?? 'not recorded'}
              {item.yours_source && ` (${item.yours_source})`} · Registry:{' '}
              {FORMAT_WORDS[item.registry] ?? item.registry}
              {item.cart_id && ` (${item.cart_id})`}
            </p>
          </li>
        ))}
      </ul>
    </section>
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
        setError(await errorMessage(response))
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
          setError(await errorMessage(response))
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

          <NeedsMatch onChange={load} />
          <Disagreements />
        </>
      )}
    </section>
  )
}
