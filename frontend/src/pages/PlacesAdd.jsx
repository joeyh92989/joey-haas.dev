import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import PlaceFields, {
  FALLBACK_CITIES,
  HOME_CITY,
  emptyFields,
  fieldsPayload,
} from '../components/places/PlaceFields.jsx'
import PlaceResultRow from '../components/places/PlaceResultRow.jsx'
import { placesAdd as words } from '../content/placesAdd.js'
import { apiFetch, errorMessage } from '../lib/api.js'
import { localToday, sittingLabel } from '../lib/intake.js'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** A search row's identity: its OpenStreetMap id, else its title. */
const keyOf = (row) => row.source_id ?? row.external_id ?? row.title

/**
 * One call to the intake API. Resolves `{ok: true, data}`, or
 * `{ok: false, message}` in the server's words (a 409 here is the page's own
 * conflict, not the catalogue lock) or the page's own when it did not answer.
 */
async function call(path, method, body) {
  try {
    const response = await apiFetch(path, {
      method,
      headers: body ? JSON_HEADERS : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: await errorMessage(response, { ownConflicts: true }),
      }
    }
    return { ok: true, data: await response.json() }
  } catch {
    return { ok: false, status: 0, message: words.noAnswer }
  }
}

/** Where a typed place's refusal belongs: beside its field when it names one. */
function typedErrorField(message) {
  if (/coordinate|latitude|longitude|maps link/i.test(message)) return 'coords'
  if (/name/i.test(message)) return 'name'
  return 'form'
}

/**
 * Add a place, at /admin/places/add (story #340, direction C of the
 * mockup): search OpenStreetMap by name, Add a result to open its fields in
 * the row, Save place to commit it as a private spot, and the place joins
 * "Added this visit". One sitting per visit, made on the first Add. Typing
 * sends nothing; only submit searches. Type it by hand takes a name and
 * coordinates. "Paste a list" is not drawn (a later story, #342).
 */
export default function PlacesAdd() {
  const [query, setQuery] = useState('')
  const [phase, setPhase] = useState('empty') // empty | searching | results | failed | done
  const [searched, setSearched] = useState({ q: '', results: [] })
  const [failure, setFailure] = useState(null)
  const [openKey, setOpenKey] = useState(null)
  const [values, setValues] = useState(emptyFields)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [added, setAdded] = useState([])
  const [doneName, setDoneName] = useState('')
  const [typeOpen, setTypeOpen] = useState(false)
  const [typed, setTyped] = useState({ name: '', coords: '' })
  const [typedValues, setTypedValues] = useState(emptyFields)
  const [typedError, setTypedError] = useState(null)
  const [cities, setCities] = useState(FALLBACK_CITIES)

  const sitting = useRef(null) // the sitting's pending request, then {ok, id}
  const inflight = useRef(false) // a request of the page is under way
  const typedEntry = useRef(null) // the typed place's entry, kept across a failed commit
  const entries = useRef(new Map()) // result key -> entry id
  const focusNext = useRef(null)
  const inputRef = useRef(null)
  const headRef = useRef(null)
  const listRef = useRef(null)
  const noneRef = useRef(null)
  const failRef = useRef(null)
  const doneRef = useRef(null)
  const typeNameRef = useRef(null)
  const refs = {
    input: inputRef,
    head: headRef,
    list: listRef,
    none: noneRef,
    fail: failRef,
    done: doneRef,
    typeName: typeNameRef,
  }

  // The cities already on saved spots, offered beside Denver. Best effort:
  // the short fixed list stands when the spots cannot be read.
  useEffect(() => {
    let live = true
    apiFetch('/api/spots')
      .then((response) => (response.ok ? response.json() : []))
      .then((spots) => {
        if (!live || !Array.isArray(spots)) return
        const found = [
          ...new Set(
            spots
              .map((spot) => String(spot.city ?? '').toLowerCase())
              .filter((city) => city && city !== HOME_CITY),
          ),
        ].sort()
        if (found.length) setCities(found)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

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
  else if (phase === 'done') status = words.status.done(doneName)
  else if (none) status = words.status.none(searched.q)
  else if (showResults) {
    if (owned.length) status = words.status.saved(results.length, searched.q)
    else if (openRow && several) status = words.status.picked(openRow.title)
    else if (single) status = words.status.one(searched.q)
    else status = words.status.several(results.length, searched.q)
  }
  // The empty state and the Done heading carry these words themselves.
  const statusHidden = ['empty', 'failed', 'done'].includes(phase) || none

  function search(q) {
    const text = q.trim()
    if (!text || busy || phase === 'searching') return
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

  /** Forgets the visit's sitting and entries: the server deletes a sitting
   *  when a commit leaves nothing to check, and the next Add makes a new one. */
  function forgetSitting() {
    sitting.current = null
    entries.current.clear()
    typedEntry.current = null
  }

  /** `attempt()` once; on a 404 (the sitting or entry is gone) a fresh
   *  sitting and the same attempt once more. */
  async function retryGone(attempt) {
    const first = await attempt()
    if (first.ok || first.status !== 404) return first
    forgetSitting()
    return attempt()
  }

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

  async function ensureSitting() {
    if (!sitting.current) {
      const pending = (async () => {
        const made = await call('/api/intake/sittings', 'POST', {
          area: 'places',
          kind: 'place',
          label: sittingLabel({ label: 'Place' }),
        })
        if (!made.ok) {
          if (sitting.current === pending) sitting.current = null
          return made
        }
        return { ok: true, id: made.data.id }
      })()
      sitting.current = pending
    }
    return sitting.current
  }

  /** The entry for a result: made once, then reused (a second POST is a 409). */
  async function ensureEntry(row) {
    const key = keyOf(row)
    const made = await ensureSitting()
    if (!made.ok) return made
    if (entries.current.has(key)) {
      return { ok: true, id: entries.current.get(key), sittingId: made.id }
    }
    const entry = await call(`/api/intake/sittings/${made.id}/places`, 'POST', {
      chosen: row,
      result_count: results.length,
    })
    if (!entry.ok) return entry
    entries.current.set(key, entry.data.id)
    return { ok: true, id: entry.data.id, sittingId: made.id }
  }

  function addRow(row) {
    return exclusive(async () => {
      setBusy(true)
      setNotice(null)
      const entry = await retryGone(() => ensureEntry(row))
      setBusy(false)
      if (!entry.ok) {
        setNotice(entry.message)
        return
      }
      setOpenKey(keyOf(row))
      setValues(emptyFields())
      focusNext.current = 'head'
    })
  }

  function commit(sittingId) {
    return call(`/api/intake/sittings/${sittingId}/commit`, 'POST', {
      today: localToday(),
    })
  }

  /** A failed commit leaves no READY entry the owner thinks was not saved. */
  function parkEntry(entryId) {
    return call(`/api/intake/entries/${entryId}`, 'PATCH', { state: 'check' })
  }

  /** Remembers what the commit wrote and moves the page to Saved. */
  function finish(data, name, isPublic, address = '') {
    const fresh = data.spots_new ?? []
    setAdded((old) => [
      ...fresh.map((spot) => ({
        id: spot.id,
        name: spot.name,
        address: spot.name === name ? address : '',
        isPublic: spot.name === name && isPublic,
      })),
      ...old,
    ])
    setDoneName(name)
    setOpenKey(null)
    setPhase('done')
    focusNext.current = 'done'
  }

  function saveRow(row) {
    return exclusive(async () => {
      setBusy(true)
      setNotice(null)
      const payload = fieldsPayload(values)
      const outcome = await retryGone(async () => {
        const entry = await ensureEntry(row)
        if (!entry.ok) return entry
        const patched = await call(`/api/intake/entries/${entry.id}`, 'PATCH', {
          payload,
          state: 'ready',
        })
        if (!patched.ok) return patched
        const committed = await commit(entry.sittingId)
        if (!committed.ok) await parkEntry(entry.id)
        return committed
      })
      setBusy(false)
      if (!outcome.ok) {
        setNotice(outcome.message)
        return
      }
      // The commit may have deleted the sitting: the next Add starts afresh.
      forgetSitting()
      const fresh = outcome.data.spots_new ?? []
      const already = outcome.data.spots_owned ?? []
      if (!fresh.length && already.length) {
        // Saved meanwhile (from another tab or a lookalike): the row says so.
        setSearched((old) => ({
          ...old,
          results: old.results.map((r) =>
            keyOf(r) === keyOf(row)
              ? { ...r, owned_spot_id: already[0].id }
              : r,
          ),
        }))
        setOpenKey(null)
        setNotice(words.alreadyOnList)
        return
      }
      finish(outcome.data, row.title, payload.is_public, row.address)
    })
  }

  function saveTyped(event) {
    event.preventDefault()
    return exclusive(async () => {
      setBusy(true)
      setTypedError(null)
      const payload = fieldsPayload(typedValues)
      const name = typed.name.trim()
      const coords = typed.coords.trim()
      const outcome = await retryGone(async () => {
        const made = await ensureSitting()
        if (!made.ok) return made
        let entryId
        const held = typedEntry.current
        if (held && held.name === name && held.coords === coords) {
          // A retry after a failed commit: the entry is still there.
          entryId = held.id
          const patched = await call(
            `/api/intake/entries/${entryId}`,
            'PATCH',
            { payload, state: 'ready' },
          )
          if (!patched.ok) return patched
        } else {
          const entry = await call(
            `/api/intake/sittings/${made.id}/places`,
            'POST',
            { name, coords, ...payload },
          )
          if (!entry.ok) return { ...entry, atPost: true }
          entryId = entry.data.id
          typedEntry.current = { id: entryId, name, coords }
        }
        const committed = await commit(made.id)
        if (!committed.ok) await parkEntry(entryId)
        return committed
      })
      setBusy(false)
      if (!outcome.ok) {
        setTypedError({
          field:
            outcome.atPost && outcome.status === 422
              ? typedErrorField(outcome.message)
              : 'form',
          message: outcome.message,
        })
        return
      }
      forgetSitting()
      if (!(outcome.data.spots_new ?? []).length) {
        setTypedError({ field: 'form', message: words.alreadyOnList })
        return
      }
      setTyped({ name: '', coords: '' })
      setTypedValues(emptyFields())
      setTypeOpen(false)
      setSearched({ q: searched.q, results: [] })
      finish(outcome.data, name, payload.is_public)
    })
  }

  function openType() {
    setTypeOpen(true)
    focusNext.current = 'typeName'
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

  return (
    <>
      <AdminPageHeader title={words.title} description={words.description} />
      <div className="place-col">
        <div className="place-search-parts">
          <form
            className="place-search"
            role="search"
            aria-label={words.searchLabel}
            onSubmit={(event) => {
              event.preventDefault()
              search(query)
            }}
          >
            <label htmlFor="place-q">{words.nameLabel}</label>
            <div className="place-search-row">
              <input
                ref={inputRef}
                type="search"
                id="place-q"
                enterKeyHint="search"
                autoComplete="off"
                aria-describedby="place-q-hint"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button
                type="submit"
                className="btn primary"
                disabled={phase === 'searching'}
              >
                {phase === 'searching' ? words.searching : words.search}
              </button>
            </div>
            <p className="place-hint" id="place-q-hint">
              {words.searchHint}
            </p>
          </form>
          {phase === 'searching' && (
            <div className="place-progress" aria-hidden="true" />
          )}
          <p
            className={`place-status${statusHidden ? ' visually-hidden' : ''}`}
            role="status"
            aria-live="polite"
          >
            {status}
          </p>
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
                  onClick={() => search(searched.q)}
                >
                  {words.tryAgain}
                </button>
                <button type="button" className="btn ghost" onClick={openType}>
                  {words.typeByHand}
                </button>
              </div>
            </div>
          )}
          {none && (
            <div className="empty-state">
              <p className="empty-state-title" tabIndex={-1} ref={noneRef}>
                {status}
              </p>
              <p>{words.noneHelp}</p>
              <div className="intake-actions">
                <button type="button" className="btn" onClick={changeWords}>
                  {words.changeWords}
                </button>
                <button type="button" className="btn" onClick={openType}>
                  {words.typeByHand}
                </button>
              </div>
            </div>
          )}
        </div>
        {notice && (
          <p className="admin-error" role="alert">
            {notice}
          </p>
        )}
        <div className="place-ways" role="group" aria-label="Other ways in">
          <span className="muted">{words.otherWays}</span>
          <button
            type="button"
            className="btn"
            aria-expanded={typeOpen}
            aria-controls="place-type-way"
            onClick={openType}
          >
            {words.typeByHand}
          </button>
        </div>
        {typeOpen && (
          <section
            className="panel"
            id="place-type-way"
            aria-labelledby="place-type-h"
          >
            <div className="panel-head">
              <h2 id="place-type-h">{words.typeHeading}</h2>
            </div>
            <div className="panel-body">
              <form
                className="place-type-form"
                aria-label={words.typeHeading}
                onSubmit={saveTyped}
              >
                <div className="intake-field">
                  <label htmlFor="place-type-name">{words.name}</label>
                  <input
                    ref={typeNameRef}
                    type="text"
                    id="place-type-name"
                    required
                    autoComplete="off"
                    aria-invalid={typedError?.field === 'name' || undefined}
                    aria-describedby={
                      typedError?.field === 'name'
                        ? 'place-type-name-e'
                        : undefined
                    }
                    value={typed.name}
                    onChange={(event) =>
                      setTyped({ ...typed, name: event.target.value })
                    }
                  />
                  {typedError?.field === 'name' && (
                    <p
                      className="place-field-error"
                      id="place-type-name-e"
                      role="alert"
                    >
                      {typedError.message}
                    </p>
                  )}
                </div>
                <div className="intake-field">
                  <label htmlFor="place-type-coords">{words.coords}</label>
                  <input
                    type="text"
                    id="place-type-coords"
                    required
                    autoComplete="off"
                    aria-invalid={typedError?.field === 'coords' || undefined}
                    aria-describedby={`place-type-coords-h${typedError?.field === 'coords' ? ' place-type-coords-e' : ''}`}
                    value={typed.coords}
                    onChange={(event) =>
                      setTyped({ ...typed, coords: event.target.value })
                    }
                  />
                  <p className="place-hint" id="place-type-coords-h">
                    {words.coordsHint}
                  </p>
                  {typedError?.field === 'coords' && (
                    <p
                      className="place-field-error"
                      id="place-type-coords-e"
                      role="alert"
                    >
                      {typedError.message}
                    </p>
                  )}
                </div>
                <PlaceFields
                  values={typedValues}
                  onChange={setTypedValues}
                  cities={cities}
                />
                {typedError?.field === 'form' && (
                  <p className="admin-error" role="alert">
                    {typedError.message}
                  </p>
                )}
                <div className="intake-actions">
                  <button type="submit" className="btn primary" disabled={busy}>
                    {words.savePlace}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      setTypeOpen(false)
                      setTypedError(null)
                    }}
                  >
                    {words.cancel}
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}
        {phase === 'done' && (
          <section className="panel place-done">
            <div className="panel-body place-stack-sm">
              <h2 className="place-done-made" tabIndex={-1} ref={doneRef}>
                Saved {doneName}
              </h2>
              <p>{words.doneNote}</p>
              <div className="intake-actions">
                <button type="button" className="btn primary" onClick={again}>
                  {words.addAnother}
                </button>
                <Link className="btn" to="/admin/spots">
                  {words.viewOnSpots}
                </Link>
              </div>
            </div>
          </section>
        )}
        {showResults && (
          <div className="place-results">
            <ul
              ref={listRef}
              tabIndex={-1}
              aria-label={`Results for “${searched.q}”`}
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
                  onAdd={() => addRow(row)}
                  onSave={() => saveRow(row)}
                  onCancel={() => {
                    if (several) {
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
                <button type="button" className="btn" onClick={openType}>
                  {words.typeByHand}
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
        {added.length > 0 && (
          <section className="panel" aria-labelledby="place-added-h">
            <div className="panel-head">
              <h2 id="place-added-h">{words.addedHeading}</h2>
              <span className="spots-pill">{added.length}</span>
            </div>
            <ul className="place-added">
              {added.map((spot) => (
                <li key={spot.id}>
                  <span>
                    <b>{spot.name}</b>
                    {spot.address && (
                      <>
                        {' '}
                        <span className="muted">{spot.address}</span>
                      </>
                    )}
                  </span>
                  <span className="place-saved-mark">
                    {spot.isPublic ? words.savedPublic : words.savedPrivate}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  )
}
