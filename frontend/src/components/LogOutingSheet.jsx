import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Sheet from './Sheet.jsx'
import { call } from './places/placeApi.js'
import { outings as words } from '../content/outings.js'
import { placesAdd } from '../content/placesAdd.js'
import {
  FALLBACK_CITIES,
  HOME_CITY,
  citiesFrom,
  cityLabel,
  spotCity,
} from '../lib/cities.js'
import { formatDate } from '../lib/formatDate.js'
import { addDays } from '../lib/daily.js'
import { localToday } from '../lib/statusMoves.js'
import { READ_DEADLINE_MS, WaitTimeout, withDeadline } from '../lib/waits.js'

const OTHER = 'other'
const SAVED_ROWS = 4

/** A saved spot's second line: neighbourhood, city when not Denver, state. */
function spotSub(spot) {
  // A spot the list never loaded (only its id and name are known) says
  // nothing about want or been.
  const known = spot.visit_count !== undefined
  const state = spot.last_visit
    ? `Been, ${formatDate(spot.last_visit)}`
    : 'Want'
  return [
    spot.neighbourhood,
    spotCity(spot) !== HOME_CITY ? cityLabel(spotCity(spot)) : null,
    known ? state : null,
  ]
    .filter(Boolean)
    .join(', ')
}

function matchSaved(spots, text) {
  const low = text.trim().toLowerCase()
  if (!low) return []
  return (spots ?? []).filter((spot) =>
    `${spot.name} ${spot.neighbourhood ?? ''}`.toLowerCase().includes(low),
  )
}

/**
 * Log an outing: one sheet that picks a place (a saved spot, or a new one
 * from the OpenStreetMap search) and logs a visit to it in a single request,
 * `POST /api/spots/outings`. Typing in the place box only filters the saved
 * spots (no request); the search runs when the form is submitted.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {(result: {visit: object, spot: object, created: boolean}) => void} props.onSaved
 *   Called once the outing is saved, before the sheet closes.
 * @param {() => void} [props.onMaybeSaved]
 *   Called when the save got no answer: the outing may or may not have been
 *   written, so the page should read its list again. The sheet stays open.
 */
export default function LogOutingSheet({
  open,
  onClose,
  onSaved,
  onMaybeSaved,
}) {
  const titleId = useId()
  const [saving, setSaving] = useState(false)
  return (
    <Sheet
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      className="lo-sheet"
      canClose={() => !saving}
    >
      {open && (
        <OutingBody
          titleId={titleId}
          onClose={onClose}
          onSaved={onSaved}
          onMaybeSaved={onMaybeSaved}
          saving={saving}
          setSaving={setSaving}
        />
      )}
    </Sheet>
  )
}

function OutingBody({
  titleId,
  onClose,
  onSaved,
  onMaybeSaved,
  saving,
  setSaving,
}) {
  const today = useMemo(() => localToday(), [])
  const tomorrow = useMemo(() => addDays(today, 1), [today])
  const [spots, setSpots] = useState(null)
  const [spotsFailed, setSpotsFailed] = useState(false)
  const [q, setQ] = useState('')
  // idle | searching | results | failed
  const [search, setSearch] = useState({ phase: 'idle', q: '', results: [] })
  const [place, setPlace] = useState(null)
  const [city, setCity] = useState(HOME_CITY)
  const [cityOther, setCityOther] = useState('')
  const [date, setDate] = useState(today)
  const [verdict, setVerdict] = useState(null)
  const [note, setNote] = useState('')
  const [title, setTitle] = useState('')
  const [kid, setKid] = useState(false)
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const live = useRef(true)
  const alertRef = useRef(null)
  const inflight = useRef(false)
  const searchSeq = useRef(0)
  const searchInput = useRef(null)

  useEffect(() => {
    live.current = true
    call('/api/spots', 'GET').then((answer) => {
      if (!live.current) return
      if (answer.ok) setSpots(answer.data)
      else setSpotsFailed(true)
    })
    return () => {
      live.current = false
    }
  }, [])

  useEffect(() => {
    if (failure) alertRef.current?.focus()
  }, [failure])

  const matches = useMemo(
    () => matchSaved(spots, q).slice(0, SAVED_ROWS),
    [spots, q],
  )
  // Denver first, then the cities already on saved spots (or the short fixed
  // list until a spot outside Denver exists).
  const cityKeys = useMemo(() => {
    const own = citiesFrom(spots)
    return [HOME_CITY, ...(own.length ? own : FALLBACK_CITIES)]
  }, [spots])
  const futureDate = !!date && date > tomorrow
  const dateError = futureDate ? words.futureDate : errors.date
  const placeName = place ? (place.spot?.name ?? place.title) : ''

  /** One call under the read deadline; a hang reads as no answer. */
  async function timed(fn) {
    try {
      return await withDeadline(fn, { ms: READ_DEADLINE_MS })
    } catch (error) {
      if (!(error instanceof WaitTimeout)) throw error
      return { ok: false, status: 0, message: placesAdd.noAnswer }
    }
  }

  async function runSearch(event) {
    event.preventDefault()
    const text = q.trim()
    if (!text || search.phase === 'searching') return
    setErrors((e) => ({ ...e, place: null }))
    setSearch({ phase: 'searching', q: text, results: [] })
    const seq = (searchSeq.current += 1)
    const answer = await timed((signal) =>
      call(
        `/api/intake/search?area=places&query=${encodeURIComponent(text)}`,
        'GET',
        undefined,
        signal,
      ),
    )
    // Gone, or the words changed while it was out: the answer is stale.
    if (!live.current || seq !== searchSeq.current) return
    const rows = answer.ok ? (answer.data.results ?? []) : []
    const problem = answer.ok
      ? (answer.data.sources ?? []).find(
          (source) => source.state === 'failed' || source.state === 'busy',
        )
      : null
    if (!answer.ok || (!rows.length && problem)) {
      setSearch({ phase: 'failed', q: text, results: [] })
      return
    }
    setSearch({ phase: 'results', q: text, results: rows })
  }

  /** Back to idle; a search still out is stale and its answer is dropped. */
  function resetSearch() {
    searchSeq.current += 1
    setSearch({ phase: 'idle', q: '', results: [] })
  }

  function pickSpot(spot) {
    setPlace({ spot })
    setErrors((e) => ({ ...e, place: null }))
    setFailure(null)
    resetSearch()
  }

  function useResult(row) {
    if (row.owned_spot_id) {
      const saved = (spots ?? []).find((s) => s.id === row.owned_spot_id)
      pickSpot(saved ?? { id: row.owned_spot_id, name: row.title })
      return
    }
    setPlace({
      title: row.title,
      address: row.address,
      lat: row.lat,
      lng: row.lng,
      source_id: row.source_id,
    })
    setCity(HOME_CITY)
    setCityOther('')
    setErrors((e) => ({ ...e, place: null }))
    setFailure(null)
    resetSearch()
  }

  function changePlace() {
    resetSearch()
    setPlace(null)
    setFailure(null)
    // After the search box is back on the page.
    setTimeout(() => searchInput.current?.focus(), 0)
  }

  const cityValue = city === OTHER ? cityOther.trim() : city

  async function save() {
    const next = {}
    if (!place) next.place = words.needPlace
    if (!verdict) next.verdict = words.needVerdict
    if (place && !place.spot && city === OTHER && !cityValue) {
      next.city = words.cityNameRequired
    }
    setErrors(next)
    if (Object.keys(next).length || futureDate) {
      requestAnimationFrame(() => {
        const bad = document.querySelector('.lo-sheet [aria-invalid="true"]')
        bad?.focus()
      })
      return
    }
    const body = place.spot
      ? { spot_id: place.spot.id }
      : {
          place: {
            name: place.title,
            lat: place.lat,
            lng: place.lng,
            city: cityValue,
            ...(place.source_id ? { source_id: place.source_id } : {}),
          },
        }
    if (date) body.visited_on = date
    body.verdict = verdict
    if (title.trim()) body.title = title.trim()
    if (kid) body.kid_along = true
    if (note.trim()) body.note = note.trim()
    if (inflight.current) return
    inflight.current = true
    setFailure(null)
    setSaving(true)
    const answer = await timed((signal) =>
      call('/api/spots/outings', 'POST', body, signal),
    )
    inflight.current = false
    if (!live.current) return
    setSaving(false)
    if (!answer.ok) {
      // The server names the field it refused: show it there as well.
      if (answer.status === 422 && /in the future/.test(answer.message)) {
        setErrors((e) => ({ ...e, date: answer.message }))
      } else if (
        answer.status === 422 &&
        answer.message.startsWith('A title is at most')
      ) {
        setErrors((e) => ({ ...e, title: answer.message }))
      }
      if (answer.status === 0) {
        // No answer: the save may have landed. Say so, and have the page
        // read its list again so the owner can look before trying again.
        setFailure(words.maybeSaved(placeName, !place.spot))
        onMaybeSaved?.()
      } else {
        setFailure(words.failed(answer.message, placeName, !place.spot))
      }
      return
    }
    onSaved?.(answer.data)
    onClose()
  }

  const showCityName = city === OTHER
  const cityShown = showCityName
    ? cityOther.trim() || 'the city you name'
    : cityLabel(city)

  return (
    <>
      <div className="lo-head">
        <h2 id={titleId}>{words.title}</h2>
      </div>
      <div className="lo-body" inert={saving}>
        {place ? (
          <div className="lo-field">
            <span className="lo-label">{words.placeLabel}</span>
            <div className="lo-picked">
              <div className="lo-picked-top">
                <div className="lo-picked-text">
                  <p className="lo-name">{placeName}</p>
                  <p className="lo-sub">
                    {place.spot ? spotSub(place.spot) : place.address}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={changePlace}
                  aria-label={`${words.change} ${words.placeLabel.toLowerCase()}`}
                >
                  {words.change}
                </button>
              </div>
              {!place.spot && (
                <div className="lo-newplace">
                  <p>
                    <span className="lo-tag is-new">{words.isNew}</span>
                    <span className="lo-tag">{words.isPrivate}</span>{' '}
                    {words.newNote(cityShown)}
                  </p>
                  <div className="lo-field">
                    <label htmlFor="lo-city">{words.cityLabel}</label>
                    <select
                      id="lo-city"
                      className="lo-input"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    >
                      {cityKeys.map((key) => (
                        <option key={key} value={key}>
                          {cityLabel(key)}
                        </option>
                      ))}
                      <option value={OTHER}>{words.otherCity}</option>
                    </select>
                    {showCityName && (
                      <>
                        <label htmlFor="lo-city-other">{words.cityName}</label>
                        <input
                          id="lo-city-other"
                          className="lo-input"
                          maxLength={40}
                          value={cityOther}
                          onChange={(e) => setCityOther(e.target.value)}
                          aria-invalid={errors.city ? 'true' : undefined}
                          aria-describedby={
                            errors.city ? 'lo-err-city' : undefined
                          }
                        />
                        {errors.city && (
                          <p className="lo-err" id="lo-err-city" role="alert">
                            {errors.city}
                          </p>
                        )}
                      </>
                    )}
                    <p className="lo-hint">{words.cityHint}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="lo-field">
            <form className="lo-field" onSubmit={runSearch} noValidate>
              <label htmlFor="lo-q">{words.placeLabel}</label>
              <div className="lo-searchrow">
                <input
                  ref={searchInput}
                  id="lo-q"
                  className="lo-input"
                  type="text"
                  autoComplete="off"
                  enterKeyHint="search"
                  data-autofocus
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value)
                    // New words: the last search's rows no longer answer them.
                    resetSearch()
                  }}
                  aria-invalid={errors.place ? 'true' : undefined}
                  aria-describedby={errors.place ? 'lo-err-place' : 'lo-q-hint'}
                />
                <button
                  type="submit"
                  className="btn"
                  disabled={search.phase === 'searching'}
                >
                  {search.phase === 'searching'
                    ? words.searching
                    : words.search}
                </button>
              </div>
              {errors.place && (
                <p className="lo-err" id="lo-err-place" role="alert">
                  {errors.place}
                </p>
              )}
              <p className="lo-hint" id="lo-q-hint">
                {words.placeHint}
              </p>
            </form>
            {spotsFailed && <p className="lo-hint">{words.savedLoadFailed}</p>}
            {q.trim() &&
              search.phase === 'idle' &&
              (matches.length ? (
                <SavedRows list={matches} onPick={pickSpot} />
              ) : (
                spots && (
                  <p className="lo-hint">{words.noSavedMatch(q.trim())}</p>
                )
              ))}
            <SearchOutcome search={search} onUse={useResult} />
          </div>
        )}

        <div className="lo-field">
          <label htmlFor="lo-date">{words.dateLabel}</label>
          <div className="lo-daterow">
            <input
              id="lo-date"
              className="lo-input"
              type="date"
              max={tomorrow}
              value={date}
              onChange={(e) => {
                setDate(e.target.value)
                setErrors((x) => ({ ...x, date: null }))
                setFailure(null)
              }}
              aria-invalid={dateError ? 'true' : undefined}
              aria-describedby={dateError ? 'lo-err-date' : undefined}
            />
            {dateError && (
              <p className="lo-err" id="lo-err-date" role="alert">
                {dateError}
              </p>
            )}
          </div>
        </div>

        <fieldset
          className="lo-field"
          aria-describedby={errors.verdict ? 'lo-err-verdict' : undefined}
        >
          <legend>{words.verdictLabel}</legend>
          <div className="lo-seg">
            {words.verdicts.map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="lo-verdict"
                  value={value}
                  checked={verdict === value}
                  aria-invalid={errors.verdict ? 'true' : undefined}
                  onChange={() => {
                    setVerdict(value)
                    setErrors((e) => ({ ...e, verdict: null }))
                  }}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {errors.verdict && (
            <p className="lo-err" id="lo-err-verdict" role="alert">
              {errors.verdict}
            </p>
          )}
        </fieldset>

        <div className="lo-field">
          <label htmlFor="lo-note">
            {words.noteLabel}{' '}
            <span className="lo-opt">{words.noteOptional}</span>
          </label>
          <input
            id="lo-note"
            className="lo-input"
            type="text"
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="lo-field">
          <div className="lo-labelrow">
            <label className="lo-label" htmlFor="lo-title">
              {words.titleLabel}{' '}
              <span className="lo-opt">{words.titleOptional}</span>
            </label>
            <span className="lo-count" aria-hidden="true">
              {title.length}/80
            </span>
          </div>
          <input
            id="lo-title"
            className="lo-input"
            type="text"
            maxLength={80}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setErrors((x) => ({ ...x, title: null }))
            }}
            aria-invalid={errors.title ? 'true' : undefined}
            aria-describedby={
              errors.title ? 'lo-err-title lo-title-hint' : 'lo-title-hint'
            }
          />
          {errors.title && (
            <p className="lo-err" id="lo-err-title" role="alert">
              {errors.title}
            </p>
          )}
          <p className="lo-hint" id="lo-title-hint">
            {words.titleHint}
          </p>
        </div>

        <label className="lo-check">
          <input
            type="checkbox"
            checked={kid}
            onChange={(e) => setKid(e.target.checked)}
          />
          <span>{words.kid}</span>
        </label>
      </div>

      <div className="lo-foot">
        {failure && (
          <div className="lo-alert" role="alert" tabIndex={-1} ref={alertRef}>
            <strong>{words.failedTitle}</strong>
            <p>{failure}</p>
          </div>
        )}
        <button
          type="button"
          className="btn ghost"
          onClick={onClose}
          disabled={saving}
        >
          {words.cancel}
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={save}
          disabled={saving}
        >
          {saving ? words.saving : failure ? words.tryAgain : words.save}
        </button>
      </div>
    </>
  )
}

function SavedRows({ list, onPick }) {
  return (
    <ul className="lo-rows">
      {list.map((spot) => (
        <li key={spot.id}>
          <button
            type="button"
            className="lo-rowpick"
            onClick={() => onPick(spot)}
          >
            <span>
              <b>{spot.name}</b>
              <small>{spotSub(spot)}</small>
            </span>
            <em>{words.savedMark}</em>
          </button>
        </li>
      ))}
    </ul>
  )
}

function SearchOutcome({ search, onUse }) {
  const { phase, q, results } = search
  if (phase === 'idle') return null
  if (phase === 'searching') {
    return (
      <p className="lo-status" role="status">
        <span className="lo-spin" aria-hidden="true" />
        {placesAdd.status.searching(q)}
      </p>
    )
  }
  if (phase === 'failed') {
    return (
      <p className="lo-status" role="status">
        {placesAdd.failed(q)}
      </p>
    )
  }
  if (!results.length) {
    return (
      <div className="lo-results">
        <p className="lo-status" role="status">
          {placesAdd.status.none(q)}
        </p>
        <p className="lo-hint">{placesAdd.bar.noneHelp}</p>
      </div>
    )
  }
  const n = results.length
  const anySaved = results.some((r) => r.owned_spot_id)
  const status = anySaved
    ? placesAdd.status.saved(n, q)
    : n === 1
      ? placesAdd.status.one(q)
      : placesAdd.status.several(n, q)
  return (
    <div className="lo-results">
      <p className="lo-status" role="status">
        {status}
      </p>
      <ul className="lo-rows">
        {results.map((row, i) => (
          <li key={row.source_id ?? `${row.title}-${i}`}>
            <button
              type="button"
              className="lo-rowpick"
              onClick={() => onUse(row)}
            >
              <span>
                <b>{row.title}</b>
                <small>{row.address}</small>
              </span>
              <em>
                {row.owned_spot_id ? placesAdd.alreadySaved : row.category}
              </em>
            </button>
          </li>
        ))}
      </ul>
      <p className="lo-credit">{placesAdd.osmCredit}</p>
    </div>
  )
}
