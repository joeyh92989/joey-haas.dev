import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import AreaCard, { AreaLead } from '../components/AreaCard.jsx'
import CoverImage from '../components/CoverImage.jsx'
import JobsList, { NightlyStatus } from '../components/JobsList.jsx'
import { StatusText } from '../components/JobStatusRow.jsx'
import OutfitSwatches from '../components/OutfitSwatches.jsx'
import SwapSheet from '../components/SwapSheet.jsx'
import WrapUpSheet from '../components/WrapUpSheet.jsx'
import { jobsSummary, useNightly } from '../lib/adminJobs.js'
import { counted } from '../lib/analytics.js'
import { apiFetch } from '../lib/api.js'
import { OCCASION_LABELS, swapTile, woreGarments } from '../lib/closet.js'
import { dashboardCounts } from '../lib/dashboard.js'
import { ownerYear } from '../lib/formatDate.js'
import { localToday } from '../lib/statusMoves.js'

/**
 * A JSON body, or null when it cannot be read. Never rejects: a card shows
 * what it has rather than failing the page.
 */
async function readJson(path) {
  try {
    const response = await apiFetch(path)
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

/**
 * Reads `path` once per `round`. undefined until the first read lands, null
 * when the read failed. A later round keeps the last body until its own
 * lands, so a card never drops the controls it was just used through.
 */
function useRead(path, round = 0) {
  const [body, setBody] = useState(undefined)
  useEffect(() => {
    let live = true
    readJson(path).then((next) => {
      if (live) setBody(next)
    })
    return () => {
      live = false
    }
  }, [path, round])
  return body
}

const listLength = (body) => (Array.isArray(body) ? body.length : null)
const figure = (value) => (value === null || value === undefined ? '—' : value)

/** The game in hand's line of detail: platform, sessions and hours. */
function continuingMeta(card) {
  const parts = [card.platform]
  if (card.sessions) parts.push(counted(card.sessions, 'session'))
  if (card.journal_hours) parts.push(`${Math.round(card.journal_hours)}h`)
  return parts.filter(Boolean).join(' · ')
}

/** The lead outfit's line of detail: the occasion, the bike, the weather. */
function outfitMeta(plan) {
  const parts = [OCCASION_LABELS[plan.occasion] ?? plan.occasion]
  if (plan.bike) parts.push('bike')
  if (plan.weather) parts.push(`${plan.weather.low}° → ${plan.weather.high}°`)
  return parts.join(' · ')
}

/**
 * Closet: the day's stored lead outfit as swatches, with Wore this and
 * Swap. Only a stored plan is read (`stored_only`), so Home never spends a
 * model call; the card hides until the nightly job (or Today) has planned.
 */
function ClosetCard({ untagged }) {
  const today = useRead('/api/closet/today?stored_only=true')
  const [outfit, setOutfit] = useState(null)
  const [swapped, setSwapped] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
  const [worn, setWorn] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const plan = today?.plan ?? null
  const lead = outfit ?? plan?.lead ?? null
  if (today !== undefined && !lead) return null

  async function wore() {
    if (busy) return
    setBusy(true)
    setError(false)
    try {
      const response = await apiFetch('/api/closet/wore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          occasion: plan.occasion,
          bike: plan.bike,
          source: swapped ? 'swapped' : 'planned',
          garments: woreGarments(lead),
        }),
      })
      if (!response.ok) throw new Error(`status ${response.status}`)
      setWorn((await response.json()).worn ?? true)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  const done = worn ?? today?.worn
  return (
    <>
      <AreaCard
        title="Closet"
        to="/admin/closet/today"
        linkLabel="Today"
        lead={
          lead ? (
            <AreaLead
              cover={<OutfitSwatches garments={lead.garments} />}
              title={lead.garments.map((g) => g.name).join(' · ')}
              meta={outfitMeta(plan)}
            />
          ) : (
            <p className="muted">Loading…</p>
          )
        }
        figures={[
          { label: 'Untagged', value: figure(untagged) },
          { label: 'Fit today', value: figure(plan?.footnote?.fit) },
        ]}
        actions={
          lead &&
          (done ? (
            <span className="muted">Worn ✓</span>
          ) : (
            <>
              <button
                type="button"
                className="btn primary sm"
                disabled={busy}
                onClick={wore}
              >
                Wore this
              </button>
              <button
                type="button"
                className="btn sm"
                disabled={busy}
                onClick={() => setSwapOpen(true)}
              >
                Swap
              </button>
              {error && (
                <span className="admin-error" role="alert">
                  Couldn’t record it.
                </span>
              )}
            </>
          ))
        }
      />
      {plan && (
        <SwapSheet
          open={swapOpen}
          outfit={lead}
          occasion={plan.occasion}
          bike={plan.bike}
          onClose={() => setSwapOpen(false)}
          onChoose={(tile) => {
            setSwapOpen(false)
            setOutfit(swapTile(lead, tile))
            setSwapped(true)
          }}
        />
      )}
    </>
  )
}

/**
 * Shelf: the game in hand with Log tonight and Wrap up, or else the next
 * game to start; what is owned, finished this year and out this week.
 */
function ShelfCard({ items, year }) {
  const [round, setRound] = useState(0)
  const [wrap, setWrap] = useState(null)
  const [logError, setLogError] = useState(false)
  // The game being logged, held from the press until the refetch says the
  // day is logged, so a second press cannot post the same day twice.
  const [loggingId, setLoggingId] = useState(null)
  const continuing = useRead('/api/picker/continuing', round)
  const next = useRead('/api/public/next')

  const card = continuing?.cards?.[0] ?? null
  const pick = next?.tonight?.up_next ?? next?.tonight?.picks?.[0] ?? null
  const counts = items ? dashboardCounts(items, year) : null
  const comics = Array.isArray(next?.comics_this_week)
    ? next.comics_this_week.length
    : null

  // Nothing to show at all: no game and nothing owned.
  if (
    counts &&
    counts.owned === 0 &&
    !card &&
    !pick &&
    continuing !== undefined
  )
    return null

  async function logTonight() {
    if (loggingId === card.item_id) return
    setLoggingId(card.item_id)
    setLogError(false)
    try {
      const response = await apiFetch(`/api/items/${card.item_id}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ played_on: localToday() }),
      })
      if (!response.ok) throw new Error(`status ${response.status}`)
      // Left held: the refetch brings the day back as logged.
      setRound((current) => current + 1)
    } catch {
      setLogError(true)
      setLoggingId(null)
    }
  }

  let lead = null
  let actions = null
  if (card) {
    const logged = card.last_played_on === localToday()
    lead = (
      <AreaLead
        cover={<CoverImage src={card.cover_url} type={card.type} />}
        title={`Continue: ${card.title}`}
        meta={continuingMeta(card)}
      />
    )
    actions = (
      <>
        <button
          type="button"
          className="btn primary sm"
          disabled={logged || loggingId === card.item_id}
          onClick={logTonight}
        >
          {logged ? 'Logged tonight' : 'Log tonight'}
        </button>
        <button
          type="button"
          className="btn sm"
          onClick={() =>
            setWrap({
              item: {
                id: card.item_id,
                title: card.title,
                cover_url: card.cover_url,
                type: card.type,
              },
              preselect: 'finished',
            })
          }
        >
          Wrap up
        </button>
        {logError && (
          <span className="admin-error" role="alert">
            Couldn’t log tonight.
          </span>
        )}
      </>
    )
  } else if (pick) {
    lead = (
      <AreaLead
        cover={<CoverImage src={pick.cover_url} type={pick.type} />}
        title={`Up next: ${pick.title}`}
        meta={pick.platform}
      />
    )
  } else if (continuing === undefined) {
    lead = <p className="muted">Loading…</p>
  }

  return (
    <>
      <AreaCard
        title="Shelf"
        to="/admin/play-next"
        linkLabel="Play Next"
        lead={lead}
        figures={[
          { label: 'Owned', value: figure(counts?.owned) },
          {
            label: `Finished · ${year}`,
            value: figure(counts?.finishedThisYear),
          },
          { label: 'Comics this week', value: figure(comics) },
        ]}
        actions={actions}
      />
      <WrapUpSheet
        subject={wrap}
        onClose={() => setWrap(null)}
        onDone={() => {
          setWrap(null)
          setRound((current) => current + 1)
        }}
      />
    </>
  )
}

/** Denver: this weekend's first suggestions, and the spots and the queue. */
function DenverCard() {
  const plan = useRead('/api/spots/plan')
  const spots = useRead('/api/spots')
  const candidates = useRead('/api/spots/candidates')
  const suggestions = Array.isArray(plan?.suggestions) ? plan.suggestions : []
  const spotCount = listLength(spots)
  const queued = listLength(candidates)

  if (spotCount === 0 && plan !== undefined && suggestions.length === 0)
    return null

  const [first, second] = suggestions
  const lead = first ? (
    <AreaLead
      title={`${first.when} · ${first.name}`}
      meta={second && `${second.when} · ${second.name}`}
    />
  ) : (
    plan === undefined && <p className="muted">Loading…</p>
  )

  return (
    <AreaCard
      title="Denver"
      to="/admin/weekend"
      linkLabel="Weekend"
      lead={lead}
      figures={[
        { label: 'Spots', value: figure(spotCount) },
        { label: 'Candidates', value: figure(queued) },
      ]}
      actions={
        queued ? (
          <Link className="btn sm" to="/admin/spots">
            Review candidates
          </Link>
        ) : null
      }
    />
  )
}

/** Site: the last seven days' traffic and the nightly jobs in one line. */
function SiteCard({ nightly }) {
  const views = useRead('/api/analytics?range=7d')
  const read = typeof views?.views === 'number' ? views : null
  // Ranked rows from analytics._ranked: {value, count}.
  const top = read?.pages?.[0]?.value ?? null
  const summary = nightly.jobs ? jobsSummary(nightly.jobs) : null

  return (
    <AreaCard
      title="Site"
      to="/admin/analytics"
      linkLabel="Analytics"
      lead={
        summary ? (
          <p className="area-card-meta">
            <StatusText state={summary.state}>{summary.words}</StatusText>
          </p>
        ) : null
      }
      figures={[
        { label: 'Views · 7 days', value: figure(read?.views) },
        { label: 'Visitors', value: figure(read?.visitors) },
        ...(top ? [{ label: 'Top page', value: top }] : []),
      ]}
      actions={
        <Link className="btn sm" to="/admin/jobs">
          Jobs
        </Link>
      }
    />
  )
}

/**
 * Admin Home, at /admin: one card per area with the one thing that matters
 * today, then the nightly jobs. AdminLayout has already checked the session
 * and loads the rows.
 */
export default function Admin() {
  const { items, closetUntagged } = useOutletContext() ?? {}
  const nightly = useNightly()
  const year = ownerYear(nightly.now)

  return (
    <section className="dashboard">
      <AdminPageHeader title="Home">
        <NightlyStatus nightly={nightly} />
      </AdminPageHeader>

      <div className="area-cards">
        <ClosetCard untagged={closetUntagged} />
        <ShelfCard items={items} year={year} />
        <DenverCard />
        <SiteCard nightly={nightly} />
      </div>

      <JobsList
        nightly={nightly}
        action={
          <Link to="/admin/jobs">
            Jobs <span aria-hidden="true">→</span>
          </Link>
        }
      />
    </section>
  )
}
