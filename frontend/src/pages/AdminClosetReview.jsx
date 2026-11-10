import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import ReviewDeck from '../components/ReviewDeck.jsx'
import SeasonTurnBanner from '../components/SeasonTurnBanner.jsx'
import SellChecklistSheet from '../components/SellChecklistSheet.jsx'
import StatTile, { StatTiles } from '../components/StatTile.jsx'
import { ACTION_ERROR, LOAD_ERROR, WAKING } from '../content/status.js'
import { apiFetch, errorMessage } from '../lib/api.js'
import { garmentTitle } from '../lib/closet.js'

const SESSION_ENDED = 'Your session ended. Sign in again to review.'
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
  return (
    <div className="closet-toast" role="status">
      <span>{toast.words}</span>
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
  const [slow, setSlow] = useState(false)
  const [busy, setBusy] = useState(false)
  // Ids skipped this visit, and how many cards were decided: the deck's
  // place is decided + skipped + 1 of that plus what is left.
  const [skipped, setSkipped] = useState([])
  const [decided, setDecided] = useState(0)
  const [toast, setToast] = useState(null)
  const [selling, setSelling] = useState(null)
  const [bannerHidden, setBannerHidden] = useState(false)
  const busyRef = useRef(false)
  const headingRef = useRef(null)
  const focusDeck = useRef(false)

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

  const deck = (review?.deck ?? []).filter(
    (card) => !skipped.includes(card.garment.id),
  )
  const card = deck[0] ?? null

  useEffect(() => {
    if (!focusDeck.current) return
    focusDeck.current = false
    headingRef.current?.focus()
  }, [card?.garment.id])

  /**
   * One write, then a fresh read of the review; the write's body, or null
   * with the error set.
   */
  async function write(path, body) {
    if (busyRef.current) return null
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      const response = await apiFetch(path, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: body ? JSON.stringify(body) : undefined,
      })
      if (response.status === 401 || response.status === 403) {
        setError(SESSION_ENDED)
        return null
      }
      if (!response.ok) {
        setError(await refusal(response))
        return null
      }
      const answer = await response.json()
      const fresh = await apiFetch('/api/closet/review')
      if (fresh.ok) take(await fresh.json())
      return answer
    } catch {
      setError(ACTION_ERROR)
      return null
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function decide(outcome, backOn) {
    const id = card.garment.id
    const name = garmentTitle(card.garment)
    const body = await write(`/api/closet/garments/${id}/decision`, {
      outcome,
      ...(backOn ? { back_on: backOn } : {}),
    })
    if (!body) return
    setSelling(null)
    setDecided((count) => count + 1)
    focusDeck.current = true
    setToast({
      words: `${DONE_WORDS[outcome]}: ${name}`,
      token: body.undo,
      deck: true,
    })
  }

  async function packAll() {
    const body = await write('/api/closet/pack-all')
    if (!body) return
    setToast({ words: `Packed ${pieces(body.ids.length)}`, token: body.undo })
  }

  async function unpackAll() {
    const body = await write('/api/closet/unpack-all')
    if (!body) return
    setToast({ words: `Unpacked ${pieces(body.ids.length)}`, token: body.undo })
  }

  async function sold(garment) {
    const body = await write(`/api/closet/garments/${garment.id}/sold`)
    if (!body) return
    setToast({ words: `Sold: ${garmentTitle(garment)}`, token: body.undo })
  }

  async function dismissBanner() {
    await write('/api/closet/review/dismiss')
  }

  async function undo() {
    const body = await write('/api/closet/undo', { token: toast.token })
    if (!body) return
    if (toast.deck) setDecided((count) => Math.max(0, count - 1))
    setToast(null)
  }

  function skip() {
    focusDeck.current = true
    setSkipped((ids) => [...ids, card.garment.id])
  }

  function oneByOne() {
    setBannerHidden(true)
    focusDeck.current = true
    // Already on the card: move there now.
    headingRef.current?.focus()
  }

  const turnOpen = review?.turn.open
  const description =
    review && turnOpen
      ? `${review.tiles.flagged} flagged · ${review.turn.name} turn`
      : null
  const position = decided + skipped.length + 1
  const total = decided + skipped.length + deck.length
  const tiles = review?.tiles

  return (
    <section className="review">
      <AdminPageHeader title="Review" description={description} />

      {error && (
        <p className="admin-error" role="alert">
          {error}
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
            <p className="panel review-empty">
              Nothing to decide. Next season turn: {review.next_turn}.
            </p>
          )}

          {review.listed.length > 0 && (
            <Listed garments={review.listed} busy={busy} onSold={sold} />
          )}
        </>
      )}

      <SellChecklistSheet
        card={selling}
        busy={busy}
        onClose={() => setSelling(null)}
        onList={() => decide('sell')}
      />
    </section>
  )
}
