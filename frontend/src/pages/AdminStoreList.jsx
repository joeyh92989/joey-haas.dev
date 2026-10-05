import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import { apiFetch, errorMessage } from '../lib/api.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import NextRow from '../components/NextRow.jsx'
import { spine } from '../content/spine.js'
import { groupByPlatform } from '../lib/next.js'

const UNREACHABLE = 'Could not reach the API. Try again shortly.'

/** The server's sections, in the order a store visit reads them. */
const SECTION_ORDER = ['buy_now', 'preorders', 'later', 'not_on_cartridge']

/** Each answer's route and the line that confirms it. */
const ANSWERS = {
  own: (title) => `Added ${title} to the collection`,
  want: (title) => `Added ${title} to the want list`,
  dismiss: (title) => `Dropped ${title}`,
}

const CURRENCY_SIGNS = { USD: '$', EUR: '€', GBP: '£' }

/** A listing's price as a store shows it: "$59.99", else "59.99 CAD". */
function money(line) {
  const amount = Number(line.price).toFixed(2)
  const sign = CURRENCY_SIGNS[line.currency]
  if (sign) return `${sign}${amount}`
  return line.currency ? `${amount} ${line.currency}` : amount
}

/** One store's listing as a line: store · price · pre-order. */
function storeWords(line) {
  const price = line.price != null ? ` · ${money(line)}` : ''
  const preorder = line.availability === 'preorder' ? ' · pre-order' : ''
  return `${line.store}${price}${preorder}`
}

/** Where a game is listed; a line with a URL links to the store's page. */
function StoreLines({ lines }) {
  if (!lines?.length) return null
  return (
    <ul className="store-lines">
      {lines.map((line, index) => (
        <li key={`${line.store}-${index}`}>
          {line.url ? (
            <a href={line.url} rel="noreferrer noopener">
              {storeWords(line)}
            </a>
          ) : (
            storeWords(line)
          )}
        </li>
      ))}
    </ul>
  )
}

async function fetchList() {
  try {
    const response = await apiFetch('/api/recommendations/store-list')
    if (response.status === 401) return { state: 'unauthorized' }
    if (!response.ok)
      return { state: 'error', error: await errorMessage(response) }
    return { state: 'ready', list: await response.json() }
  } catch {
    return { state: 'error', error: UNREACHABLE }
  }
}

/**
 * What to look for in a store, read from the server's sections (the same
 * ones What's next shows, with the admin fields): one column, large tap
 * targets, nothing on hover, for a phone held in an aisle. Got it is Already
 * own, Want adds the game to the want list, Not interested drops it for
 * good. The row goes at once and comes back if the server refuses.
 */
export default function AdminStoreList() {
  usePageTitle('Store list · Admin')
  const { signedIn = false } = useOutletContext() ?? {}
  const [state, setState] = useState('loading')
  const [sections, setSections] = useState(null)
  const [hidden, setHidden] = useState(() => new Set())
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const apply = useCallback((result) => {
    setState(result.state)
    if (result.state === 'ready') setSections(result.list.sections ?? {})
    if (result.error) setError(result.error)
  }, [])

  // A change of session refetches: drop the last answer (a stale "Sign in"
  // line) until the new one lands. Adjusted during render, as React advises,
  // because react-hooks/set-state-in-effect forbids it in the effect body.
  const [fetchedFor, setFetchedFor] = useState(signedIn)
  if (fetchedFor !== signedIn) {
    setFetchedFor(signedIn)
    setState('loading')
  }

  useEffect(() => {
    let live = true
    fetchList().then((result) => {
      if (live) apply(result)
    })
    return () => {
      live = false
    }
  }, [apply, signedIn])

  function show(id, shown) {
    setHidden((current) => {
      const next = new Set(current)
      if (shown) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Answers a suggestion: `action` is 'own', 'want' or 'dismiss'. */
  async function answer(entry, action) {
    setError(null)
    setMessage(null)
    show(entry.id, false)
    try {
      const response = await apiFetch(
        `/api/recommendations/${entry.id}/${action}`,
        { method: 'POST' },
      )
      if (response.status === 409) {
        // errorMessage words every 409 as a running refresh; here it is the
        // suggestion's own answer ("Already on your shelf"), so it stays off.
        const body = await response.json().catch(() => ({}))
        setError(`${entry.title}: ${body.detail ?? 'already answered'}`)
        return
      }
      if (!response.ok) {
        show(entry.id, true)
        setError(await errorMessage(response))
        return
      }
      setMessage(ANSWERS[action](entry.title))
    } catch {
      show(entry.id, true)
      setError(UNREACHABLE)
    }
  }

  function actions(entry, key) {
    const choices =
      key === 'not_on_cartridge'
        ? [['dismiss', 'Not interested']]
        : [
            ['own', 'Got it'],
            ['want', 'Want'],
            ['dismiss', 'Not interested'],
          ]
    return choices.map(([action, label]) => (
      <button
        key={action}
        type="button"
        onClick={() => answer(entry, action)}
        aria-label={`${label}: ${entry.title}`}
      >
        {label}
      </button>
    ))
  }

  if (state === 'unauthorized') {
    return (
      <section>
        <h1>Store list</h1>
        <p>
          <Link to="/admin">Sign in</Link> to see the store list.
        </p>
      </section>
    )
  }

  const visible = (key) =>
    (sections?.[key] ?? []).filter((entry) => !hidden.has(entry.id))
  const empty =
    sections && SECTION_ORDER.every((key) => visible(key).length === 0)

  function rows(entries, key) {
    return (
      <ul className="next-rows">
        {entries.map((entry) => (
          <NextRow
            key={entry.id}
            row={entry}
            section={key}
            actions={actions(entry, key)}
            extra={
              <>
                {entry.format_note && (
                  <span className="muted">{entry.format_note}</span>
                )}
                <StoreLines lines={entry.store_lines} />
              </>
            }
          />
        ))}
      </ul>
    )
  }

  return (
    <section className="store-list">
      <h1>Store list</h1>
      {!empty && (
        <p className="store-list-note">
          On Switch 2 boxes, put back Game-Key Cards.
        </p>
      )}
      <p className="catalogue-progress" role="status" aria-live="polite">
        {message ?? ''}
      </p>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {state === 'loading' && <p className="muted">Loading the list…</p>}
      {empty && (
        <p className="muted">
          Nothing to look for yet: generate{' '}
          <Link to="/admin/discover">Discover</Link> and{' '}
          <Link to="/admin/radar">Radar</Link> first.
        </p>
      )}
      {sections &&
        SECTION_ORDER.map((key) => {
          const entries = visible(key)
          if (entries.length === 0) return null
          return (
            <section
              key={key}
              className="store-list-section"
              aria-labelledby={`store-list-${key}`}
            >
              <h2 id={`store-list-${key}`}>{spine.next.sections[key]}</h2>
              {key === 'buy_now'
                ? groupByPlatform(entries).map((group) => (
                    <div key={group.platform} className="next-group">
                      <h3>{group.platform}</h3>
                      {rows(group.rows, key)}
                    </div>
                  ))
                : rows(entries, key)}
            </section>
          )
        })}
    </section>
  )
}
