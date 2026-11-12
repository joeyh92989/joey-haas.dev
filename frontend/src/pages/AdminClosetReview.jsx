import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import ReviewDeck from '../components/ReviewDeck.jsx'
import SeasonTurnBanner from '../components/SeasonTurnBanner.jsx'
import SellChecklistSheet from '../components/SellChecklistSheet.jsx'
import StatTile, { StatTiles } from '../components/StatTile.jsx'
import {
  ACTION_ERROR,
  LOAD_ERROR,
  SESSION_ENDED,
  WAKING,
} from '../content/status.js'
import { apiFetch, errorMessage } from '../lib/api.js'
import { garmentTitle } from '../lib/closet.js'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/**
 * A refused write in the route's words. Review's 409s are not the
 * catalogue lock `errorMessage` names them for: they say the garment moved
 * on, or that the undo is gone.
 */
async function refusal(response) {
  if (response.status !== 409) return errorMessage(response)
  try {
    const body = await response.json()
    if (typeof body.detail === 'string') return body.detail
  } catch {
    // Not JSON; the generic words below.
  }
  return 'That changed elsewhere. Reload the page.'
}

/** "2 pieces" or "1 piece". */
function pieces(count) {
  return `${count} ${count === 1 ? 'piece' : 'pieces'}`
}

/** The toast's words after an outcome. */
const DONE_WORDS = {
  keep: 'Kept',
  pack: 'Packed away',
  sell: 'Listed',
  donate: 'Donated',
}

/** Packed garments whose month has come: Unpack all brings them back. */
function DueBack({ garments, busy, onUnpackAll }) {
  return (
    <section className="review-banner" aria-label="Due back">
      <p>
        {pieces(garments.length)} due back:{' '}
        {garments.map((g) => garmentTitle(g)).join(', ')}.
      </p>
      <div className="review-banner-acts">
        <button
          type="button"
          className="btn primary sm"
          disabled={busy}
          onClick={onUnpackAll}
        >
          Unpack all
        </button>
      </div>
    </section>
  )
}

/** Listed garments, each with Mark sold. */
function Listed({ garments, busy, onSold }) {
  return (
    <section className="panel review-listed" aria-labelledby="review-listed">
      <h2 id="review-listed" className="kicker">
        Listed for sale
      </h2>
      <ul>
        {garments.map((garment) => (
          <li key={garment.id}>
            <span>{garmentTitle(garment)}</span>
            <button
              type="button"
              className="btn sm"
              disabled={busy}
              onClick={() => onSold(garment)}
            >
              Mark sold
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The undo toast after an outcome, Pack all, Unpack all or Mark sold. */
function UndoToast({ toast, busy, onUndo, onDismiss }) {
  // Only the words are announced: a status region around the buttons would
  // read "Undo Dismiss" out with every change.
  return (
    <div className="closet-toast">
      <span role="status">{toast.words}</span>
      <span className="closet-toast-acts">
        <button
          type="button"
          className="btn sm"
          disabled={busy}
          onClick={onUndo}
        >
          Undo
        </button>
        <button type="button" className="btn sm ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </span>
    </div>
  )
}

/** The deck's end: nothing left, or only what was skipped this visit. */
function DeckEmpty({ skipped, nextTurn, emptyRef, onShowSkipped }) {
  if (skipped === 0)
    return (
      <p className="panel review-empty" tabIndex={-1} ref={emptyRef}>
        Nothing to decide. Next season turn: {nextTurn}.
      </p>
    )
  return (
    <div className="panel review-empty">
      <p tabIndex={-1} ref={emptyRef}>
        {pieces(skipped)} skipped for next time.
      </p>
      <button type="button" className="btn sm" onClick={onShowSkipped}>
        Show skipped
      </button>
    </div>
  )
}

/**
 * `/admin/closet/review`: the season-turn banner, four tiles, and the deck
 * of flagged pieces one at a time from `GET /api/closet/review`. Every
 * outcome is one POST and a fresh read, so the tiles, the banner and the
 * area's badge follow; Skip is the page's alone and leaves the piece for
 * next time. The last write can be undone from the toast (the route keeps
 * one level).
 */
export default function AdminClosetReview() {
  const context = useOutletContext() ?? {}
  const setClosetReview = context.setClosetReview
  const [review, setReview] = useState(null)
  const [error, setError] = useState(null)
  // A write that landed but whose fresh read failed: the page is behind.
  const [stale, setStale] = useState(false)
  const [slow, setSlow] = useState(false)
  const [busy, setBusy] = useState(false)
  // Ids skipped and decided this visit. Each counts toward the deck's
  // place only while the review agrees: a skipped piece while it is still
  // in the deck, a decided one once it has left it (an undo brings it back).
  const [skipped, setSkipped] = useState([])
  const [decided, setDecided] = useState([])
  const [toast, setToast] = useState(null)
  const [selling, setSelling] = useState(null)
  const [bannerHidden, setBannerHidden] = useState(false)
  // Where focus goes after the next render: bumped, never set back, so the
  // effect runs after the render that carries the new review.
  const [focusAsk, setFocusAsk] = useState(0)
  const busyRef = useRef(false)
  const headingRef = useRef(null)
  const emptyRef = useRef(null)

  function take(body) {
    setReview(body)
    setClosetReview?.(body.tiles.flagged)
  }

  useEffect(() => {
    let live = true
    const timer = setTimeout(() => setSlow(true), 3000)
    apiFetch('/api/closet/review')
      .then(async (response) => {
        if (response.status === 401 || response.status === 403)
          throw new Error(SESSION_ENDED)
        if (!response.ok) throw new Error(LOAD_ERROR)
        const body = await response.json()
        if (live) take(body)
      })
      .catch((failure) => {
        if (live)
          setError(
            failure.message === SESSION_ENDED ? SESSION_ENDED : LOAD_ERROR,
          )
      })
      .finally(() => clearTimeout(timer))
    return () => {
      live = false
      clearTimeout(timer)
    }
    // Once per visit; every write reads it again itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const inDeck = new Set((review?.deck ?? []).map((c) => c.garment.id))
  const skippedHere = skipped.filter((id) => inDeck.has(id)).length
  const decidedHere = new Set(decided.filter((id) => !inDeck.has(id))).size
  const deck = (review?.deck ?? []).filter(
    (card) => !skipped.includes(card.garment.id),
  )
  const card = deck[0] ?? null

  useEffect(() => {
    if (!focusAsk) return
    ;(headingRef.current ?? emptyRef.current)?.focus()
  }, [focusAsk])

  /** Moves focus to the deck's card, or its end, once this render lands. */
  function focusDeck() {
    setFocusAsk((count) => count + 1)
  }

  /** A fresh read of the review; true when it landed. */
  async function refresh() {
    try {
      const fresh = await apiFetch('/api/closet/review')
      if (!fresh.ok) return false
      take(await fresh.json())
      return true
    } catch {
      return false
    }
  }

  /**
   * One write, then a fresh read of the review: `{ok: true, answer}`, or
   * `{ok: false, status}` with the error set. A 409 reads the review again
   * too, since it means the page is behind what the server holds.
   */
  async function write(path, body) {
    if (busyRef.current) return { ok: false, status: null }
    busyRef.current = true
    setBusy(true)
    setError(null)
    setStale(false)
    try {
      const response = await apiFetch(path, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: body ? JSON.stringify(body) : undefined,
      })
      if (response.status === 401 || response.status === 403) {
        setError(SESSION_ENDED)
        return { ok: false, status: response.status }
      }
      if (!response.ok) {
        setError(await refusal(response))
        if (response.status === 409) await refresh()
        return { ok: false, status: response.status }
      }
      const answer = await response.json()
      if (!(await refresh())) setStale(true)
      return { ok: true, answer }
    } catch {
      setError(ACTION_ERROR)
      return { ok: false, status: null }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function retryRefresh() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      if (await refresh()) {
        setStale(false)
        focusDeck()
      }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  /** An outcome for `target`, the deck's card unless the sheet names one. */
  async function decide(outcome, backOn, target = card) {
    const id = target.garment.id
    const name = garmentTitle(target.garment)
    const result = await write(`/api/closet/garments/${id}/decision`, {
      outcome,
      ...(backOn ? { back_on: backOn } : {}),
    })
    if (!result.ok) return
    setSelling(null)
    setDecided((ids) => [...ids, id])
    setToast({
      words: `${DONE_WORDS[outcome]}: ${name}`,
      token: result.answer.undo,
    })
    focusDeck()
  }

  async function packAll() {
    const result = await write('/api/closet/pack-all')
    if (!result.ok) return
    if (result.answer.undo)
      setToast({
        words: `Packed ${pieces(result.answer.ids.length)}`,
        token: result.answer.undo,
      })
    // The banner that held focus has gone.
    focusDeck()
  }

  async function unpackAll() {
    const result = await write('/api/closet/unpack-all')
    if (!result.ok) return
    if (result.answer.undo)
      setToast({
        words: `Unpacked ${pieces(result.answer.ids.length)}`,
        token: result.answer.undo,
      })
    focusDeck()
  }

  async function sold(garment) {
    const result = await write(`/api/closet/garments/${garment.id}/sold`)
    if (!result.ok) return
    setToast({
      words: `Sold: ${garmentTitle(garment)}`,
      token: result.answer.undo,
    })
  }

  async function dismissBanner() {
    const result = await write('/api/closet/review/dismiss')
    if (result.ok) focusDeck()
  }

  async function undo() {
    const result = await write('/api/closet/undo', { token: toast.token })
    // A 409 means the undo is gone (spent, replaced or stale): the toast
    // offering it goes too, and the route's words stay in the error.
    if (!result.ok) {
      if (result.status === 409) setToast(null)
      return
    }
    setToast(null)
    focusDeck()
  }

  function skip() {
    setSkipped((ids) => [...ids, card.garment.id])
    focusDeck()
  }

  function showSkipped() {
    setSkipped([])
    focusDeck()
  }

  function oneByOne() {
    setBannerHidden(true)
    focusDeck()
  }

  const turnOpen = review?.turn.open
  const description =
    review && turnOpen
      ? `${review.tiles.flagged} flagged · ${review.turn.name} turn`
      : null
  const position = decidedHere + skippedHere + 1
  const total = decidedHere + skippedHere + deck.length
  const tiles = review?.tiles

  return (
    <section className="review">
      <AdminPageHeader title="Review" description={description} />

      {/* While the sheet is open the page behind it is inert; the sheet
          shows the error itself. */}
      {error && !selling && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {stale && (
        <p className="admin-error" role="alert">
          Saved, but the list couldn’t refresh.{' '}
          <button
            type="button"
            className="link-button"
            disabled={busy}
            onClick={retryRefresh}
          >
            Try again
          </button>
        </p>
      )}
      {toast && (
        <UndoToast
          toast={toast}
          busy={busy}
          onUndo={undo}
          onDismiss={() => setToast(null)}
        />
      )}
      {!review && !error && (
        <p className="muted">{slow ? WAKING : 'Loading…'}</p>
      )}

      {review && (
        <>
          {review.banner && !bannerHidden && (
            <SeasonTurnBanner
              banner={review.banner}
              busy={busy}
              onPackAll={packAll}
              onOneByOne={oneByOne}
              onDismiss={dismissBanner}
            />
          )}
          {review.due_back.length > 0 && (
            <DueBack
              garments={review.due_back}
              busy={busy}
              onUnpackAll={unpackAll}
            />
          )}

          <StatTiles label="Closet figures">
            <StatTile label="Active pieces" value={tiles.active} />
            <StatTile label="Worn in 30 days" value={tiles.worn_30} />
            <StatTile label="Flagged" value={tiles.flagged} />
            <StatTile
              label="Sold or donated"
              value={tiles.gone_this_year}
              detail="this year"
            />
          </StatTiles>

          {card ? (
            <ReviewDeck
              key={card.garment.id}
              card={card}
              position={position}
              total={total}
              day={review.day}
              busy={busy}
              headingRef={headingRef}
              onDecide={decide}
              onSell={() => setSelling(card)}
              onSkip={skip}
            />
          ) : (
            <DeckEmpty
              skipped={skippedHere}
              nextTurn={review.next_turn}
              emptyRef={emptyRef}
              onShowSkipped={showSkipped}
            />
          )}

          {review.listed.length > 0 && (
            <Listed garments={review.listed} busy={busy} onSold={sold} />
          )}
        </>
      )}

      <SellChecklistSheet
        card={selling}
        busy={busy}
        error={selling ? error : null}
        onClose={() => {
          setSelling(null)
          setError(null)
        }}
        onList={() => decide('sell', undefined, selling)}
      />
    </section>
  )
}
