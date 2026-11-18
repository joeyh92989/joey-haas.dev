import { useEffect, useRef, useState } from 'react'
import { placesAdd as words } from '../../content/placesAdd.js'
import { apiFetch, errorMessage } from '../../lib/api.js'
import EmptyState from '../EmptyState.jsx'
import { FALLBACK_CITIES, emptyFields, fieldsPayload } from './PlaceFields.jsx'
import PlaceResultRow from './PlaceResultRow.jsx'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** A search row's identity: its OpenStreetMap id, else its title. */
const keyOf = (row) => row.source_id ?? row.external_id ?? row.title

/**
 * One call to the intake API. Resolves `{ok: true, status, data}`, or
 * `{ok: false, message}` in the server's words (a refusal's first message
 * before the generic `detail`; a 409 here is the route's own) or the page's
 * own when the server did not answer.
 */
async function call(path, method, body) {
  try {
    const response = await apiFetch(path, {
      method,
      headers: body ? JSON_HEADERS : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!response.ok) {
      const answer = await response.json().catch(() => null)
      const refusal = answer?.refused?.[0]?.message
      return {
        ok: false,
        message:
          typeof refusal === 'string' && refusal
            ? refusal
            : await errorMessage(
                { status: response.status, json: async () => answer },
                { ownConflicts: true },
              ),
      }
    }
    return { ok: true, status: response.status, data: await response.json() }
  } catch {
    return { ok: false, message: words.noAnswer }
  }
}

/**
 * The add bar of the Spots page (story #341, direction A of the mockup): a
 * panel that searches OpenStreetMap by name and saves the place you pick as
 * one private spot, with a single call to `POST /api/intake/add` (no sitting).
 * Typing sends nothing; only submit searches. A lone result opens its fields
 * at once; several list with Add. The page keeps the table and the by-hand
 * form; the bar tells it what happened through its props.
 *
 * @param {object} props
 * @param {(spot: {id: string, name: string}) => void} props.onSaved A new
 *   spot was written, so the page can re-read its table and mark the row.
 * @param {(typedName: string) => void} props.onAddByHand "Add by hand",
 *   with the words last searched for.
 * @param {(spotId: string) => void} props.onShowInTable A spot already saved
 *   (or just saved) is to be shown in the table.
 * @param {string[]} [props.cities] Cities other than Denver, as keys.
 */
export default function SpotsAddBar({
  onSaved,
  onAddByHand,
  onShowInTable,
  cities = FALLBACK_CITIES,
}) {
  const [query, setQuery] = useState('')
  const [phase, setPhase] = useState('empty') // empty | searching | results | failed | done
  const [searched, setSearched] = useState({ q: '', results: [] })
  const [failure, setFailure] = useState(null)
  const [openKey, setOpenKey] = useState(null)
  const [values, setValues] = useState(emptyFields)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [done, setDone] = useState(null) // {id, name, isPublic}

  const inflight = useRef(false) // a request of the bar is under way
  const focusNext = useRef(null)
  const inputRef = useRef(null)
  const headRef = useRef(null)
  const listRef = useRef(null)
  const noneRef = useRef(null)
  const failRef = useRef(null)
  const refs = {
    input: inputRef,
    head: headRef,
    list: listRef,
    none: noneRef,
    fail: failRef,
  }

  // Focus follows what came back, once it is on the page.
  useEffect(() => {
    const target = focusNext.current
    if (!target) return
    const node = refs[target]?.current
    if (!node) return
    focusNext.current = null
    node.focus()
    if (target === 'input') node.select?.()
  })

  const results = searched.results
  const owned = results.filter((row) => row.owned_spot_id)
  const several = results.length > 1
  const single = results.length === 1 && owned.length === 0
  const showResults = phase === 'results' && results.length > 0
  const none = phase === 'results' && results.length === 0
  const openRow = results.find((row) => keyOf(row) === openKey)

  let status = ''
  if (phase === 'searching') status = words.status.searching(searched.q)
  else if (phase === 'done') {
    status = done.isPublic
      ? words.status.donePublic(done.name)
      : words.status.done(done.name)
  } else if (none) status = words.status.none(searched.q)
  else if (showResults) {
    if (owned.length) status = words.status.saved(results.length, searched.q)
    else if (openRow && several) status = words.status.picked(openRow.title)
    else if (single) status = words.status.one(searched.q)
    else status = words.status.several(results.length, searched.q)
  }
  // The box under the bar says the same words in these two states.
  const quiet = !status || none || phase === 'failed'
  const view = none ? 'none' : phase

  /** One request at a time: a second press in the same tick is ignored. */
  async function exclusive(work) {
    if (inflight.current) return
    inflight.current = true
    try {
      await work()
    } finally {
      inflight.current = false
    }
  }

  function search(q) {
    const text = q.trim()
    if (!text) return
    return exclusive(() => runSearch(text))
  }

  async function runSearch(text) {
    setPhase('searching')
    setSearched({ q: text, results: [] })
    setNotice(null)
    setOpenKey(null)
    const answer = await call(
      `/api/intake/search?area=places&query=${encodeURIComponent(text)}`,
      'GET',
    )
    const rows = answer.ok ? (answer.data.results ?? []) : []
    const problem = answer.ok
      ? (answer.data.sources ?? []).find(
          (source) => source.state === 'failed' || source.state === 'busy',
        )
      : null
    if (!answer.ok || (!rows.length && problem)) {
      // The reason is the source's own words; a status string is not shown.
      setFailure(answer.ok ? (problem.reason ?? null) : null)
      setPhase('failed')
      focusNext.current = 'fail'
      return
    }
    setSearched({ q: text, results: rows })
    setPhase('results')
    if (rows.length === 1 && !rows[0].owned_spot_id) {
      setOpenKey(keyOf(rows[0]))
      setValues(emptyFields())
      focusNext.current = 'head'
    } else {
      focusNext.current = rows.length ? 'list' : 'none'
    }
  }

  function addRow(row) {
    setNotice(null)
    setOpenKey(keyOf(row))
    setValues(emptyFields())
    focusNext.current = 'head'
  }

  function saveRow(row) {
    return exclusive(async () => {
      setBusy(true)
      setNotice(null)
      const fields = fieldsPayload(values)
      const outcome = await call('/api/intake/add', 'POST', {
        kind: 'place',
        chosen: row,
        payload: { name: row.title, lat: row.lat, lng: row.lng, ...fields },
      })
      setBusy(false)
      if (!outcome.ok) {
        setNotice(outcome.message)
        return
      }
      const fresh = outcome.data.spots_new ?? []
      const already = outcome.data.spots_owned ?? []
      if (!fresh.length) {
        // Saved meanwhile (another tab, a lookalike): the row says so.
        if (already.length) {
          setSearched((old) => ({
            ...old,
            results: old.results.map((r) =>
              keyOf(r) === keyOf(row)
                ? { ...r, owned_spot_id: already[0].id }
                : r,
            ),
          }))
        }
        setOpenKey(null)
        setNotice(words.alreadyOnList)
        focusNext.current = 'list'
        return
      }
      const spot = fresh[0]
      setDone({ id: spot.id, name: spot.name, isPublic: fields.is_public })
      setQuery('')
      setSearched({ q: '', results: [] })
      setOpenKey(null)
      setPhase('done')
      focusNext.current = 'input'
      onSaved?.({ id: spot.id, name: spot.name })
    })
  }

  function changeWords() {
    inputRef.current?.focus()
    inputRef.current?.select()
  }

  function again() {
    setPhase('empty')
    setQuery('')
    setSearched({ q: '', results: [] })
    setOpenKey(null)
    setNotice(null)
    focusNext.current = 'input'
  }

  const byHand = () => onAddByHand?.(searched.q)
  const idle = phase === 'empty' && !notice

  return (
    <section
      className="panel spots-addbar"
      aria-label={words.title}
      data-state={view}
    >
      <div className="panel-body spots-addbar-body">
        <form
          className="place-search"
          role="search"
          aria-label={words.title}
          onSubmit={(event) => {
            event.preventDefault()
            search(query)
          }}
        >
          <label htmlFor="spots-addbar-q">{words.bar.nameLabel}</label>
          <div className="place-search-row">
            <input
              ref={inputRef}
              type="search"
              id="spots-addbar-q"
              enterKeyHint="search"
              autoComplete="off"
              aria-describedby="spots-addbar-hint"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="submit"
              className="btn primary"
              disabled={phase === 'searching' || busy}
            >
              {phase === 'searching' ? words.searching : words.search}
            </button>
          </div>
          <p className="place-hint" id="spots-addbar-hint">
            {words.bar.hint}
          </p>
        </form>
        {/* Always in the page, so a screen reader hears each change. */}
        <p className={`spots-addbar-statusline${quiet ? ' is-quiet' : ''}`}>
          <span className="place-status" role="status" aria-live="polite">
            {status}
          </span>
          {phase === 'done' && onShowInTable && (
            <a
              href={`#spot-${done.id}`}
              onClick={(event) => {
                event.preventDefault()
                onShowInTable(done.id)
              }}
            >
              {words.bar.showInTable}
            </a>
          )}
        </p>
        <div className={`spots-addbar-wrap${idle ? ' is-idle' : ''}`}>
          {phase === 'searching' && (
            <div className="place-progress" aria-hidden="true" />
          )}
          {notice && (
            <p className="admin-error" role="alert">
              {notice}
            </p>
          )}
          {phase === 'failed' && (
            <div className="admin-error place-fail" role="alert">
              <p tabIndex={-1} ref={failRef}>
                {words.failed(searched.q)}
              </p>
              {failure && <p className="muted">{failure}</p>}
              <div className="intake-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => search(searched.q)}
                >
                  {words.tryAgain}
                </button>
                <button type="button" className="btn ghost" onClick={byHand}>
                  {words.bar.addByHand}
                </button>
              </div>
            </div>
          )}
          {none && (
            <EmptyState
              title={status}
              titleRef={noneRef}
              line={words.bar.noneHelp}
              actions={[
                { label: words.changeWords, onClick: changeWords },
                { label: words.bar.addByHand, onClick: byHand },
              ]}
            />
          )}
          {showResults && (
            <div className="place-results">
              <ul
                ref={listRef}
                tabIndex={-1}
                aria-label={words.resultsFor(searched.q)}
              >
                {results.map((row) => (
                  <PlaceResultRow
                    key={keyOf(row)}
                    place={row}
                    open={keyOf(row) === openKey}
                    busy={busy}
                    several={several}
                    values={values}
                    cities={cities}
                    onValues={setValues}
                    onShowInTable={onShowInTable ?? null}
                    onAdd={() => addRow(row)}
                    onSave={() => saveRow(row)}
                    onCancel={() => {
                      if (inflight.current) return
                      if (several) {
                        setNotice(null)
                        setOpenKey(null)
                        focusNext.current = 'list'
                      } else again()
                    }}
                    headRef={headRef}
                  />
                ))}
              </ul>
              {(several || owned.length > 0) && (
                <div
                  className="place-foot"
                  role="group"
                  aria-label={words.noneOfTheseLabel}
                >
                  <span className="muted">{words.noneOfThese}</span>
                  <button type="button" className="btn" onClick={changeWords}>
                    {words.changeWords}
                  </button>
                  <button type="button" className="btn" onClick={byHand}>
                    {words.bar.addByHand}
                  </button>
                </div>
              )}
              <div className="place-credit">
                <p className="place-osm">
                  <a href={words.osmCopyright}>{words.osmCredit}</a>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
