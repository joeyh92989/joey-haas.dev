import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import AreaCard, { AreaLead } from '../components/AreaCard.jsx'
import CoverImage from '../components/CoverImage.jsx'
import LoadState from '../components/LoadState.jsx'
import JobsList, { NightlyStatus } from '../components/JobsList.jsx'
import { StatusText } from '../components/JobStatusRow.jsx'
import OutfitSwatches from '../components/OutfitSwatches.jsx'
import SwapSheet from '../components/SwapSheet.jsx'
import WrapUpSheet from '../components/WrapUpSheet.jsx'
import { jobsSummary, useNightly } from '../lib/adminJobs.js'
import { counted } from '../lib/analytics.js'
import { SESSION_ENDED } from '../content/status.js'
import { apiFetch, errorMessage } from '../lib/api.js'
import {
  OCCASION_LABELS,
  sameOutfit,
  swapTile,
  woreGarments,
} from '../lib/closet.js'
import { dashboardCounts } from '../lib/dashboard.js'
import { ownerYear } from '../lib/formatDate.js'
import { localToday } from '../lib/statusMoves.js'
import { READ_DEADLINE_MS, withDeadline } from '../lib/waits.js'

/** What a card says in place of a figure or lead it could not read. */
const COULDNT_READ = "Couldn't read"

/** The cards in page order, as the top line names them. */
const AREAS = ['Closet', 'Shelf', 'Denver', 'Site']

/**
 * A JSON body, or null when it cannot be read or does not answer within the
 * deadline. Never rejects: a card shows what it has rather than failing the
 * page.
 */
async function readJson(path, signal) {
  try {
    return await withDeadline(
      async (inner) => {
        const response = await apiFetch(path, { signal: inner })
        if (!response.ok) return null
        return await response.json()
      },
      { ms: READ_DEADLINE_MS, signal },
    )
  } catch {
    return null
  }
}

/**
 * Reads `path` once per `round`. undefined until the first read lands, null
 * when the read failed. A later round keeps the last good body until its own
 * lands, so a card never drops the controls it was just used through; a
 * failed one goes back to undefined (loading) while it is read again.
 */
function useRead(path, round = 0) {
  const [state, setState] = useState({ round, body: undefined })
  useEffect(() => {
    const controller = new AbortController()
    readJson(path, controller.signal).then((body) => {
      if (!controller.signal.aborted) setState({ round, body })
    })
    return () => controller.abort()
  }, [path, round])
  if (state.round !== round && state.body === null) return undefined
  return state.body
}

/** Tells Home whether the card named `area` has a read that failed. */
function useReportFailure(area, failed, onFailure) {
  useEffect(() => {
    onFailure(area, failed)
  }, [area, failed, onFailure])
}

const listLength = (body) => (Array.isArray(body) ? body.length : null)
const figure = (value, failed = false) =>
  value === null || value === undefined ? (failed ? COULDNT_READ : '—') : value

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
 * Its figures are the layout's: what Review has flagged, and what is still
 * untagged.
 */
function ClosetCard({ review, untagged, round, onFailure }) {
  const today = useRead('/api/closet/today?stored_only=true', round)
  const [outfit, setOutfit] = useState(null)
  const [swapped, setSwapped] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
  const [worn, setWorn] = useState(null)
  // Change was pressed on a worn outfit: the actions again.
  const [changing, setChanging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const plan = today?.plan ?? null
  const lead = outfit ?? plan?.lead ?? null
  const failed = today === null
  useReportFailure('Closet', failed, onFailure)
  if (today !== undefined && !failed && !lead) return null

  async function wore() {
    if (busy) return
    setBusy(true)
    setError(null)
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
      if (response.status === 401 || response.status === 403) {
        setError(SESSION_ENDED)
        return
      }
      if (!response.ok) {
        setError(await errorMessage(response))
        return
      }
      setWorn((await response.json()).worn ?? null)
      setChanging(false)
    } catch {
      setError('Couldn’t record it.')
    } finally {
      setBusy(false)
    }
  }

  // Worn ✓ only for the outfit on the card; a record of another one says so.
  const record = worn ?? today?.worn
  let done = null
  if (record && !changing && lead)
    done = sameOutfit(record, lead) ? 'Worn ✓' : 'Worn today: another outfit'
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
            <p className="muted">{failed ? COULDNT_READ : 'Loading…'}</p>
          )
        }
        figures={[
          { label: 'To review', value: figure(review, failed) },
          { label: 'Untagged', value: figure(untagged, failed) },
        ]}
        actions={
          lead &&
          (done ? (
            <>
              <span className="muted">{done}</span>
              <button
                type="button"
                className="link-button"
                onClick={() => setChanging(true)}
              >
                Change
              </button>
            </>
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
                  {error}
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
function ShelfCard({ items, year, round: retryRound, onFailure }) {
  const [round, setRound] = useState(0)
  const [wrap, setWrap] = useState(null)
  const [logError, setLogError] = useState(false)
  // The game being logged, held from the press until the refetch says the
  // day is logged, so a second press cannot post the same day twice.
  const [loggingId, setLoggingId] = useState(null)
  const continuing = useRead('/api/picker/continuing', round + retryRound)
  const next = useRead('/api/public/next', retryRound)
  const failed = continuing === null || next === null
  useReportFailure('Shelf', failed, onFailure)

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
    !failed &&
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
  } else if (continuing === null) {
    lead = <p className="muted">{COULDNT_READ}</p>
  }

  return (
    <>
      <AreaCard
        title="Shelf"
        to="/admin/play-next"
        linkLabel="Play Next"
        lead={lead}
        figures={[
          { label: 'Owned', value: figure(counts?.owned, failed) },
          {
            label: `Finished · ${year}`,
            value: figure(counts?.finishedThisYear, failed),
          },
          { label: 'Comics this week', value: figure(comics, failed) },
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
function DenverCard({ round, onFailure }) {
  const plan = useRead('/api/spots/plan', round)
  const spots = useRead('/api/spots', round)
  const candidates = useRead('/api/spots/candidates', round)
  const failed = plan === null || spots === null || candidates === null
  useReportFailure('Denver', failed, onFailure)
  const suggestions = Array.isArray(plan?.suggestions) ? plan.suggestions : []
  const spotCount = listLength(spots)
  const queued = listLength(candidates)

  if (
    spotCount === 0 &&
    plan !== undefined &&
    !failed &&
    suggestions.length === 0
  )
    return null

  const [first, second] = suggestions
  const lead = first ? (
    <AreaLead
      title={`${first.when} · ${first.name}`}
      meta={second && `${second.when} · ${second.name}`}
    />
  ) : (
    (plan === undefined || plan === null) && (
      <p className="muted">{plan === null ? COULDNT_READ : 'Loading…'}</p>
    )
  )

  return (
    <AreaCard
      title="Denver"
      to="/admin/weekend"
      linkLabel="Weekend"
      lead={lead}
      figures={[
        { label: 'Spots', value: figure(spotCount, failed) },
        { label: 'Candidates', value: figure(queued, failed) },
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
function SiteCard({ nightly, round, onFailure }) {
  const views = useRead('/api/analytics?range=7d', round)
  const failed = views === null
  useReportFailure('Site', failed, onFailure)
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
        { label: 'Views · 7 days', value: figure(read?.views, failed) },
        { label: 'Visitors', value: figure(read?.visitors, failed) },
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
  const { items, closetUntagged, closetReview } = useOutletContext() ?? {}
  const nightly = useNightly()
  const year = ownerYear(nightly.now)
  // Which cards have a read that failed, and how often each was retried.
  const [failures, setFailures] = useState({})
  const [rounds, setRounds] = useState({})
  const onFailure = useCallback(
    (area, failed) =>
      setFailures((current) =>
        current[area] === failed ? current : { ...current, [area]: failed },
      ),
    [],
  )
  const failedAreas = AREAS.filter((area) => failures[area])
  const retry = () =>
    setRounds((current) => {
      const next = { ...current }
      for (const area of failedAreas) next[area] = (next[area] ?? 0) + 1
      return next
    })

  return (
    <section className="dashboard">
      <AdminPageHeader title="Home">
        <NightlyStatus nightly={nightly} />
      </AdminPageHeader>

      {failedAreas.length > 0 && (
        <LoadState
          failed
          message={`${COULDNT_READ}: ${failedAreas.join(', ')}.`}
          onRetry={retry}
        />
      )}

      <div className="area-cards">
        <ClosetCard
          review={closetReview}
          untagged={closetUntagged}
          round={rounds.Closet ?? 0}
          onFailure={onFailure}
        />
        <ShelfCard
          items={items}
          year={year}
          round={rounds.Shelf ?? 0}
          onFailure={onFailure}
        />
        <DenverCard round={rounds.Denver ?? 0} onFailure={onFailure} />
        <SiteCard
          nightly={nightly}
          round={rounds.Site ?? 0}
          onFailure={onFailure}
        />
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
