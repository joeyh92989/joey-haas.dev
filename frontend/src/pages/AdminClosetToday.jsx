import { useEffect, useId, useRef, useState } from 'react'
import { adminCopy } from '../content/adminCopy.js'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import FilterChips from '../components/FilterChips.jsx'
import OutfitBoard from '../components/OutfitBoard.jsx'
import { Swatch } from '../components/OutfitSwatches.jsx'
import Sheet from '../components/Sheet.jsx'
import SwapSheet from '../components/SwapSheet.jsx'
import {
  ACTION_ERROR,
  LOAD_ERROR,
  PLANNING_TIMEOUT,
  SESSION_ENDED,
  STILL_PLANNING,
  WAKING_OR_PLANNING,
} from '../content/status.js'
import { apiFetch, errorMessage } from '../lib/api.js'
import { useElapsed } from '../lib/useElapsed.js'
import {
  SLOW_LOAD_AFTER_S,
  STILL_PLANNING_AFTER_S,
  WaitTimeout,
  withDeadline,
} from '../lib/waits.js'
import {
  NOT_THIS_REASONS,
  OCCASION_LABELS,
  PHOTO_ACCEPT,
  categoryLabel,
  footnoteLine,
  relaxedLines,
  sharedTopLine,
  shortLines,
  longDate,
  outfitReason,
  oversizePhoto,
  plannedWords,
  sameOutfit,
  swapTile,
  woreGarments,
} from '../lib/closet.js'
import EmptyState from '../components/EmptyState.jsx'
import {
  btn,
  chipBtn,
  closetCard,
  FILE_PICK,
  GARMENT_GRID,
  GARMENT_NAME,
  GARMENT_PHOTO,
  GARMENT_SLOT,
  GARMENT_TILE,
  PRESSED,
  TODAY,
  TODAY_ACTS,
  TODAY_ALT,
  TODAY_ALT_NAMES,
  TODAY_ALT_REASON,
  TODAY_ALTS,
  TODAY_CARD,
  TODAY_FOOTNOTE,
  TODAY_HIGH,
  TODAY_HOURS,
  TODAY_KICKER,
  TODAY_LOW,
  TODAY_PICK,
  TODAY_REASON,
  TODAY_SENTENCE,
  TODAY_SHEET_BODY,
  TODAY_STATUS,
  TODAY_TEMPS,
  TODAY_WEATHER,
  TODAY_WORN,
} from '../components/closetClasses.js'

/**
 * How the outfit on screen was chosen, for `POST /api/closet/wore`. A photo
 * match wins whatever happened after it, then a swapped piece, then an
 * alternative worn instead. Build around and From the closet plans stay
 * `planned`: the spec records those as the planner's pick, with the lock
 * on the plan, not as a source of their own.
 */
function sourceOf(plan, lead) {
  if (plan?.match) return 'own'
  if (lead.swapped) return 'swapped'
  if (lead.alt) return 'alternative'
  return 'planned'
}
const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** The chips' query for `GET /api/closet/today`. */
function todayPath(choice) {
  if (!choice) return '/api/closet/today'
  const query = new URLSearchParams({
    occasion: choice.occasion,
    bike: String(choice.bike),
  })
  return `/api/closet/today?${query}`
}

/** The morning low, the afternoon high, the read and the hours. */
function WeatherStrip({ weather }) {
  return (
    <section
      className={`${closetCard} today-weather ${TODAY_WEATHER}`}
      aria-label={adminCopy.closetToday.weather}
    >
      <p className={`today-temps ${TODAY_TEMPS}`}>
        <span className={`today-low ${TODAY_LOW}`}>{weather.low}°</span>
        <span aria-hidden="true"> → </span>
        <span className="visually-hidden"> {adminCopy.closetToday.to} </span>
        <span className={`today-high ${TODAY_HIGH}`}>{weather.high}°</span>
      </p>
      <p className={`today-sentence ${TODAY_SENTENCE}`}>{weather.sentence}</p>
      {weather.hours?.length > 0 && (
        <ol className={`today-hours ${TODAY_HOURS}`}>
          {weather.hours.map((hour) => (
            <li key={hour.label}>
              <span>{hour.label}</span> {hour.temp}°
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/** Match this…: a garment from the closet, or a photo of one. */
function MatchSheet({ open, onClose, onGarment, onPhoto }) {
  const titleId = useId()
  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId}>
      {open && (
        <MatchBody
          titleId={titleId}
          onClose={onClose}
          onGarment={onGarment}
          onPhoto={onPhoto}
        />
      )}
    </Sheet>
  )
}

function MatchBody({ titleId, onClose, onGarment, onPhoto }) {
  const [mode, setMode] = useState(null)
  const [garments, setGarments] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (mode !== 'closet' || garments) return
    let live = true
    apiFetch('/api/closet/garments')
      .then(async (response) => {
        if (!response.ok) throw new Error(`status ${response.status}`)
        const body = await response.json()
        if (!live) return
        setGarments(
          body.garments.filter((g) => g.status === 'active' && g.category),
        )
      })
      .catch(() => {
        if (live) setError(LOAD_ERROR)
      })
    return () => {
      live = false
    }
  }, [mode, garments])

  function pickPhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const oversize = oversizePhoto([file])
    if (oversize) {
      setError(oversize)
      return
    }
    onPhoto(file)
  }

  return (
    <div className={`today-sheet-body ${TODAY_SHEET_BODY}`}>
      <h2 id={titleId}>{adminCopy.closetToday.matchThis}</h2>
      <div className={`today-sheet-modes ${TODAY_ACTS}`}>
        <button
          type="button"
          className={`${btn()} ${PRESSED}`}
          aria-pressed={mode === 'closet'}
          data-autofocus
          onClick={() => setMode('closet')}
        >
          {adminCopy.closetToday.fromCloset}
        </button>
        <label className={`${btn()} ${FILE_PICK}`}>
          {adminCopy.closetToday.fromPhoto}
          <input
            type="file"
            className="visually-hidden"
            accept={PHOTO_ACCEPT}
            capture="environment"
            onChange={pickPhoto}
          />
        </label>
      </div>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {mode === 'closet' && !garments && !error && (
        <p className="muted">{adminCopy.closetToday.loading}</p>
      )}
      {mode === 'closet' && garments?.length === 0 && (
        <EmptyState title={adminCopy.closetNoPieces} />
      )}
      {garments?.length > 0 && (
        <ul className={`garment-grid today-picker ${GARMENT_GRID}`}>
          {garments.map((garment) => (
            <li key={garment.id}>
              <button
                type="button"
                className={`garment-tile today-pick ${GARMENT_TILE} ${TODAY_PICK}`}
                onClick={() => onGarment(garment)}
              >
                <span className={`garment-photo ${GARMENT_PHOTO}`}>
                  <Swatch garment={garment} className="today-tile-swatch" />
                  <span className={`garment-slot ${GARMENT_SLOT}`}>
                    {categoryLabel(garment.category)}
                  </span>
                </span>
                <span className={`garment-name ${GARMENT_NAME}`}>
                  {garment.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={`today-sheet-acts ${TODAY_ACTS}`}>
        <button type="button" className={btn('ghost')} onClick={onClose}>
          {adminCopy.closetToday.cancel}
        </button>
      </div>
    </div>
  )
}

/** The lead: the outfit board, the reason, and what to do with it. */
function OutfitCard({
  outfit,
  lockId,
  busy,
  wornState,
  saving,
  headingRef,
  onLock,
  onSave,
  onWore,
  onChange,
  onSwap,
  onSwapSlot,
  onMatch,
  onNotThis,
}) {
  const [asking, setAsking] = useState(false)
  const transient = outfit.garments.some((g) => g.transient)

  return (
    <section
      className={`${closetCard} today-card ${TODAY_CARD}`}
      aria-labelledby="today-wear"
    >
      <p
        className={`today-kicker ${TODAY_KICKER}`}
        id="today-wear"
        tabIndex={-1}
        ref={headingRef}
      >
        {adminCopy.closetToday.wearThis}
      </p>
      <OutfitBoard
        garments={outfit.garments}
        lockId={lockId}
        busy={busy}
        saving={saving}
        onLock={onLock}
        onSwap={onSwapSlot}
        onSave={onSave}
      />
      <p className={`today-reason ${TODAY_REASON}`}>{outfitReason(outfit)}</p>
      {wornState ? (
        <p className={`today-worn ${TODAY_WORN}`}>
          <span>
            {wornState === 'this' ? 'Worn ✓' : 'Worn today: another outfit'}
          </span>
          <span aria-hidden="true"> · </span>
          <button type="button" className="link-button" onClick={onChange}>
            {adminCopy.closetToday.change}
          </button>
        </p>
      ) : (
        <div className={`today-acts ${TODAY_ACTS}`}>
          <button
            type="button"
            className={btn('primary')}
            disabled={busy || transient}
            onClick={onWore}
          >
            {adminCopy.closetToday.woreThis}
          </button>
          <button
            type="button"
            className={btn()}
            disabled={busy}
            onClick={onSwap}
          >
            {adminCopy.closetToday.swapPiece}
          </button>
          <button
            type="button"
            className={btn('ghost')}
            disabled={busy}
            onClick={onMatch}
          >
            {adminCopy.closetToday.matchThis}
          </button>
          <button
            type="button"
            className={btn('ghost')}
            aria-expanded={asking}
            disabled={busy}
            onClick={() => setAsking((open) => !open)}
          >
            {adminCopy.closetToday.notThis}
          </button>
        </div>
      )}
      {asking && !wornState && (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={adminCopy.closetToday.whyNotThis}
        >
          {NOT_THIS_REASONS.map((reason) => (
            <button
              key={reason.value}
              type="button"
              className={chipBtn}
              disabled={busy}
              onClick={() => {
                setAsking(false)
                onNotThis(reason.value)
              }}
            >
              {reason.label}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/** An alternative: the small board, the names on one line, the reason. */
function OutfitAlt({ outfit, busy, onWear }) {
  return (
    <li className={`${closetCard} today-alt ${TODAY_ALT}`}>
      <OutfitBoard garments={outfit.garments} small />
      <p className={`today-alt-names ${TODAY_ALT_NAMES}`}>
        {outfit.garments.map((g) => g.name).join(' · ')}
      </p>
      <p className={`today-alt-reason ${TODAY_ALT_REASON}`}>
        {outfitReason(outfit)}
      </p>
      <button
        type="button"
        className={btn('plain', 'sm')}
        disabled={busy}
        onClick={onWear}
      >
        {adminCopy.closetToday.wearThisInstead}
      </button>
    </li>
  )
}

/**
 * Today, at /admin/closet/today and the Closet area's home: the weather,
 * the occasion chips, the outfit to wear with two alternatives, and the
 * footnote. The nightly job stores a plan per occasion chip, so a chip
 * reads its stored plan and only a missing one costs a model call.
 *
 * Swap and Wear this instead change the outfit here only; Build around,
 * Match this and Not this re-plan once. Wore this records the outfit with
 * how it was chosen (`source`).
 */
export default function AdminClosetToday() {
  // The route's whole answer: {plan, planned_just_now, worn, defaults, occasions}.
  const [answer, setAnswer] = useState(null)
  const [lead, setLead] = useState(null)
  const [alternatives, setAlternatives] = useState([])
  const [choice, setChoice] = useState(null)
  const [worn, setWorn] = useState(null)
  const [changing, setChanging] = useState(false)
  const [busy, setBusy] = useState(false)
  // What the request in flight is doing, for the status line; '' when idle.
  const [pending, setPending] = useState('')
  const [error, setError] = useState(null)
  // Bumped by Retry to run the first load again.
  const [attempt, setAttempt] = useState(0)
  // The first load failed in a way another try can fix (not a lost session).
  const [retryable, setRetryable] = useState(false)
  const elapsed = useElapsed(!answer && !error)
  const [swapOpen, setSwapOpen] = useState(false)
  // The slot a piece's own Swap opened the sheet on; undefined for Swap a piece.
  const [swapSlot, setSwapSlot] = useState(undefined)
  const [matchOpen, setMatchOpen] = useState(false)
  // The photo Match this planned around, kept for Save as owned.
  const [photo, setPhoto] = useState(null)
  const [saving, setSaving] = useState(false)
  const busyRef = useRef(false)
  const headingRef = useRef(null)
  // Set when a re-plan should move focus to the card once it lands.
  const focusCard = useRef(false)

  useEffect(() => {
    if (!focusCard.current || !lead) return
    focusCard.current = false
    headingRef.current?.focus()
  }, [lead])

  function take(body, matched = null) {
    const plan = body.plan
    setAnswer(body)
    setLead(plan?.lead ?? null)
    setAlternatives(
      (plan?.alternatives ?? []).map((outfit) => ({ ...outfit, alt: true })),
    )
    setPhoto(matched)
    setChoice({
      occasion: plan?.occasion ?? body.defaults.occasion,
      bike: plan?.bike ?? body.defaults.bike,
    })
    setWorn(body.worn)
  }

  /**
   * One call to the API; the body, or null with the error set. `label` is
   * what the status line says while it runs.
   */
  async function call(path, options, label = 'Planning…') {
    if (busyRef.current) return null
    busyRef.current = true
    setBusy(true)
    setPending(label)
    setError(null)
    try {
      const response = await apiFetch(path, options)
      if (response.status === 401 || response.status === 403) {
        setError(SESSION_ENDED)
        return null
      }
      if (!response.ok) {
        setError(await errorMessage(response))
        return null
      }
      return await response.json()
    } catch {
      setError(ACTION_ERROR)
      return null
    } finally {
      busyRef.current = false
      setBusy(false)
      setPending('')
    }
  }

  useEffect(() => {
    const unmounted = new AbortController()
    withDeadline(
      async (signal) => {
        const response = await apiFetch('/api/closet/today', { signal })
        if (response.status === 401 || response.status === 403)
          throw new Error(SESSION_ENDED)
        if (!response.ok) throw new Error(LOAD_ERROR)
        return response.json()
      },
      { signal: unmounted.signal },
    )
      .then((body) => take(body))
      .catch((failure) => {
        if (unmounted.signal.aborted) return
        const ended =
          !(failure instanceof WaitTimeout) && failure.message === SESSION_ENDED
        setRetryable(!ended)
        if (failure instanceof WaitTimeout) setError(PLANNING_TIMEOUT)
        else setError(ended ? SESSION_ENDED : LOAD_ERROR)
      })
    return () => unmounted.abort()
  }, [attempt])

  async function read(next) {
    const body = await call(todayPath(next))
    if (body) take(body)
  }

  async function replan(extra) {
    const body = await call('/api/closet/plan', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ ...choice, ...extra }),
    })
    if (body) take(body)
    return body
  }

  function changeChoice(next) {
    const occasion = next.occasion ?? choice.occasion // the pressed chip stays
    const bike = Boolean(next.bike)
    if (occasion === choice.occasion && bike === choice.bike) return
    read({ occasion, bike })
  }

  function lock(tile) {
    // A second press unlocks: the day's stored plan again.
    if (answer.plan?.lock === tile.id) read(choice)
    else replan({ lock: tile.id })
  }

  async function matchGarment(garment) {
    setMatchOpen(false)
    focusCard.current = true
    if (!(await replan({ lock: garment.id }))) focusCard.current = false
  }

  async function matchPhoto(file) {
    setMatchOpen(false)
    const form = new FormData()
    form.append('photo', file)
    form.append('occasion', choice.occasion)
    form.append('bike', String(choice.bike))
    const body = await call('/api/closet/match', { method: 'POST', body: form })
    if (body) take(body, file)
  }

  async function saveOwned() {
    if (!photo || !answer.plan?.match) return
    setSaving(true)
    const form = new FormData()
    form.append('photo', photo)
    form.append('attributes', JSON.stringify(answer.plan.match))
    const garment = await call(
      '/api/closet/garments/from-match',
      { method: 'POST', body: form },
      'Saving…',
    )
    setSaving(false)
    if (!garment) return
    const owned = (outfit) => ({
      ...outfit,
      garments: outfit.garments.map((g) =>
        g.transient
          ? {
              ...g,
              id: garment.id,
              name: garment.name ?? g.name,
              image: garment.image,
              transient: false,
              qualifier: 'not worn yet',
            }
          : g,
      ),
    })
    setLead((current) => current && owned(current))
    setAlternatives((current) => current.map(owned))
    setPhoto(null)
  }

  async function wore() {
    const body = await call(
      '/api/closet/wore',
      {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          occasion: choice.occasion,
          bike: choice.bike,
          source: sourceOf(answer.plan, lead),
          garments: woreGarments(lead),
        }),
      },
      'Recording…',
    )
    if (!body) return
    setWorn(body.worn)
    setChanging(false)
  }

  function wearInstead(index) {
    const chosen = alternatives[index]
    setAlternatives(alternatives.map((alt, i) => (i === index ? lead : alt)))
    setLead(chosen)
    setChanging(true)
  }

  function swapped(tile) {
    setSwapOpen(false)
    setLead((current) => ({ ...swapTile(current, tile), swapped: true }))
    setChanging(true)
  }

  /**
   * Not this turns down what is on screen -- a swapped piece or an
   * alternative worn instead included -- and keeps a Build around lock. An
   * unsaved photo piece has no garment to decline, so that outfit leaves
   * `declined` out and the route turns down the stored lead.
   */
  function notThis(reason) {
    const extra = { not_this: reason }
    if (!lead.garments.some((g) => g.transient))
      extra.declined = woreGarments(lead)
    if (answer.plan?.lock) extra.lock = answer.plan.lock
    replan(extra)
  }

  const plan = answer?.plan ?? null
  let wornState = null
  if (worn && !changing && lead)
    wornState = sameOutfit(worn, lead) ? 'this' : 'other'
  const words = plan ? plannedWords(plan, answer.planned_just_now) : null
  const description = plan
    ? [longDate(plan.day), words].filter(Boolean).join(' · ')
    : null

  return (
    <section className={`today ${TODAY}`}>
      <AdminPageHeader
        title={adminCopy.closetToday.title}
        description={description}
      />

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {retryable && !answer && error && (
        <button
          type="button"
          className={btn()}
          onClick={() => {
            setError(null)
            setRetryable(false)
            setAttempt((n) => n + 1)
          }}
        >
          {adminCopy.closetToday.retry}
        </button>
      )}
      {!answer && !error && (
        <p className="muted">
          {elapsed < SLOW_LOAD_AFTER_S
            ? 'Loading…'
            : `${WAKING_OR_PLANNING} · ${elapsed} s`}
        </p>
      )}
      {!answer && !error && elapsed >= STILL_PLANNING_AFTER_S && (
        <p className="muted">{STILL_PLANNING}</p>
      )}
      <p className={`muted today-status ${TODAY_STATUS}`} role="status">
        {pending}
      </p>

      {answer && (
        <>
          {plan?.weather && <WeatherStrip weather={plan.weather} />}

          <FilterChips
            groups={[
              {
                key: 'occasion',
                label: 'Occasion',
                options: answer.occasions.map((value) => ({
                  value,
                  label: OCCASION_LABELS[value] ?? value,
                  count: null,
                })),
              },
            ]}
            toggles={[
              {
                key: 'bike',
                label: 'Bike',
                count: null,
                className: 'chip-modifier',
              },
            ]}
            togglesLabel="Getting there"
            value={choice}
            onChange={changeChoice}
            disabled={busy}
          />

          {lead ? (
            <OutfitCard
              outfit={lead}
              lockId={plan?.lock}
              busy={busy}
              wornState={wornState}
              saving={saving}
              headingRef={headingRef}
              onLock={lock}
              onSave={saveOwned}
              onWore={wore}
              onChange={() => setChanging(true)}
              onSwap={() => {
                setSwapSlot(undefined)
                setSwapOpen(true)
              }}
              onSwapSlot={(slot) => {
                setSwapSlot(slot)
                setSwapOpen(true)
              }}
              onMatch={() => setMatchOpen(true)}
              onNotThis={notThis}
            />
          ) : (
            <section className={`${closetCard} today-card ${TODAY_CARD}`}>
              <p className={`today-kicker ${TODAY_KICKER}`}>
                {adminCopy.closetToday.wearThis}
              </p>
              <p className={`today-reason ${TODAY_REASON}`}>
                {plan?.model_note ?? 'Nothing is planned for today yet.'}
              </p>
            </section>
          )}

          {lead && alternatives.length > 0 && (
            <ul
              className={`today-alts ${TODAY_ALTS}`}
              aria-label={adminCopy.closetToday.alternatives}
            >
              {alternatives.map((outfit, index) => (
                <OutfitAlt
                  key={`${index}-${outfit.garments.map((g) => g.id).join('-')}`}
                  outfit={outfit}
                  busy={busy}
                  onWear={() => wearInstead(index)}
                />
              ))}
            </ul>
          )}

          {plan && (
            <footer className={`today-footnote ${TODAY_FOOTNOTE}`}>
              <p>{footnoteLine(plan, answer.planned_just_now)}</p>
              {[...relaxedLines(plan), ...shortLines(plan), sharedTopLine(plan)]
                .filter(Boolean)
                .map((line) => (
                  <p key={line}>{line}</p>
                ))}
              {lead && plan.model_note && <p>Model: {plan.model_note}</p>}
            </footer>
          )}

          <SwapSheet
            open={swapOpen}
            outfit={lead}
            occasion={choice.occasion}
            bike={choice.bike}
            slot={swapSlot}
            onClose={() => setSwapOpen(false)}
            onChoose={swapped}
          />
          <MatchSheet
            open={matchOpen}
            onClose={() => setMatchOpen(false)}
            onGarment={matchGarment}
            onPhoto={matchPhoto}
          />
        </>
      )}
    </section>
  )
}
