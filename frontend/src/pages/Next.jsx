import { useEffect, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import CappedList from '../components/CappedList.jsx'
import JumpNav from '../components/JumpNav.jsx'
import LoadState from '../components/LoadState.jsx'
import JustFinishedChip from '../components/JustFinishedChip.jsx'
import Lane from '../components/Lane.jsx'
import NextRow from '../components/NextRow.jsx'
import PickForMe from '../components/PickForMe.jsx'
import SortControl from '../components/SortControl.jsx'
import SkippedToast from '../components/SkippedToast.jsx'
import SpineHeader from '../components/SpineHeader.jsx'
import TonightAlt from '../components/TonightAlt.jsx'
import TonightLead from '../components/TonightLead.jsx'
import CoverImage from '../components/CoverImage.jsx'
import ContinueCard from '../components/ContinueCard.jsx'
import PickList from '../components/PickList.jsx'
import WrapUpSheet from '../components/WrapUpSheet.jsx'
import { ACTION_ERROR } from '../content/status.js'
import { spine } from '../content/spine.js'
import { shortDate } from '../lib/comics.js'
import { sortBuyNow, weekdayWords } from '../lib/next.js'
import { apiFetch } from '../lib/api.js'
import { localToday, pinPath, setStatus } from '../lib/statusMoves.js'
import { readShelfPref, writeShelfPref } from '../lib/shelf.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { isValidSnapshot } from '../lib/snapshot.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'
import { itemPath } from '../lib/spinePaths.js'

const copy = spine.next
const SORTS = copy.sorts.map((sort) => ({ ...sort, direction: 'desc' }))
const SORT_KEY = 'shelf.next.sort'

/** A stored sort the page no longer offers falls back to the best fit. */
function storedSort() {
  const value = readShelfPref(SORT_KEY, 'best')
  return SORTS.some((sort) => sort.value === value) ? value : 'best'
}

/**
 * Rows carry no id, and a game can be on both Switches, so the title alone
 * is not unique; two rows can still agree on every field shown, so the IGDB
 * link and the position settle it.
 */
function rowKey(row, index) {
  return [
    row.platform,
    row.title,
    row.release_date ?? '',
    row.item_id ?? '',
    row.igdb_url ?? '',
    index,
  ].join('|')
}

/** A list from the body, or an empty one when it is missing. */
function list(value) {
  return Array.isArray(value) ? value : []
}

/**
 * The body with every list the page reads. The shape check in
 * lib/snapshot.js guards both the snapshot and the live answer; this keeps
 * the page rendering rather than going blank if a body slips past it.
 */
function withLists(data) {
  return {
    generated_at: data.generated_at,
    tonight: {
      // Absent from a snapshot written before the Continue card: the picks
      // lead until the live body arrives.
      continuing: list(data.tonight?.continuing),
      up_next: data.tonight?.up_next ?? null,
      picks: list(data.tonight?.picks),
      last_finish: data.tonight?.last_finish ?? null,
      // Absent from a body written before the lanes.
      read_next: list(data.tonight?.read_next),
      watch_next: list(data.tonight?.watch_next),
    },
    comics_this_week: list(data.comics_this_week),
    wanted: list(data.wanted),
    buy_now: list(data.buy_now),
    preorders: list(data.preorders),
    later: list(data.later),
    not_on_cartridge: list(data.not_on_cartridge),
  }
}

/** The jump links: one per section that renders, in page order. */
function jumpItems(data, hasPickForMe) {
  const sections = copy.sections
  const counted = (id) => ({
    id: `next-${id}`,
    label: sections[id],
    count: data[id].length,
  })
  return [
    { id: 'next-tonight', label: sections.tonight },
    hasPickForMe && { id: 'pick-for-me', label: copy.pickForMe.heading },
    data.comics_this_week.length > 0 && {
      id: 'next-comics',
      label: sections.comics,
      count: data.comics_this_week.length,
    },
    data.wanted.length > 0 && counted('wanted'),
    data.buy_now.length > 0 && counted('buy_now'),
    data.preorders.length > 0 && counted('preorders'),
    data.later.length > 0 && counted('later'),
    data.not_on_cartridge.length > 0 && counted('not_on_cartridge'),
  ].filter(Boolean)
}

function Freshness({ generated }) {
  // The picks are live (recommendation engine spec), so they carry a word
  // rather than a date; the nightly jobs keep theirs.
  const dated = [
    [copy.fresh.catalogue, generated?.catalogue],
    [copy.fresh.discover, generated?.discover],
  ]
    .map(([label, value]) => [label, value && weekdayWords(value)])
    .filter(([, words]) => words)
    .map(([label, words]) => `${label} ${words}`)
  const parts = [copy.fresh.picksLive, ...dated]
  return <p className="muted next-fresh">{parts.join(' · ')}</p>
}

/** A section with something in it; one with nothing is left out whole. */
function Section({ id, children, count, head }) {
  if (count === 0) return null
  return (
    <section className="next-section" aria-labelledby={`next-${id}`}>
      <div className="next-section-head">
        <h2 id={`next-${id}`}>{copy.sections[id]}</h2>
        {head}
      </div>
      {children}
    </section>
  )
}

/** The most "Top pick" badges In stores now draws, in the order shown. */
const TOP_PICKS_SHOWN = 3

/**
 * One list of rows, cut short with "Show all N". `topPicks` lets the
 * section draw "Top pick" on its first few rows that carry it; the badge
 * means little on every row, and the data is untouched (the Tour reads
 * `top_pick`).
 */
function Rows({ rows, section, topPicks = 0, label }) {
  const badged = new Set()
  rows.forEach((row, index) => {
    if (row.top_pick && badged.size < topPicks) badged.add(index)
  })
  return (
    <CappedList
      items={rows}
      className="next-rows next-rows-cols"
      label={label}
      resetKey={rows.map(rowKey).join('|')}
    >
      {(row, index) => (
        <NextRow
          key={rowKey(row, index)}
          row={row}
          section={section}
          showTopPick={badged.has(index)}
        />
      )}
    </CappedList>
  )
}

/**
 * Comics this week (comics spec, AC6): issues of followed public series out
 * this week, read-only, never with a price or a store. Shown only when
 * there is one, since a quiet week is most weeks.
 */
function ComicsThisWeek({ rows }) {
  if (!rows.length) return null
  return (
    <section className="next-section" aria-labelledby="next-comics">
      <h2 id="next-comics">{copy.sections.comics}</h2>
      <ul className="next-rows">
        {rows.map((row) => (
          <li key={`${row.item_id}-${row.number}`} className="next-row">
            <Link to={itemPath(row.item_id)} className="next-row-link">
              <span className="next-row-cover">
                <CoverImage src={row.cover_url} type="comic" alt="" />
              </span>
              <span className="next-row-title">{`${row.title} #${row.number}`}</span>
            </Link>
            <div className="next-row-text">
              <span className="muted">
                {[row.publisher, shortDate(row.store_date)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {row.owned_text && (
                <span className="muted">
                  {copy.comics.owned(row.owned_text, row.released)}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Tonight (Tonight picks spec): the Just finished chip, the lead card, and
 * the other picks under it. Signed in, each card can be pinned ("Play
 * this") or skipped ("Not tonight"); writes are optimistic, and a pin is
 * confirmed by a live refetch through `onRefresh`. The public picks never
 * read a skip, so games skipped earlier today come from
 * `/api/picker/skipped-today` and are left out here.
 *
 * Read next and Watch next follow the game picks (recommendation engine
 * spec). Their start button moves the comic or movie to Active through the
 * status route; it leaves the lane at once and the refetch confirms it.
 */
function Tonight({ tonight, signedIn, onRefresh, onLead }) {
  // undefined: the body's Up next; null: unpinned here; a pick: pinned here.
  const [pin, setPin] = useState(undefined)
  const [hidden, setHidden] = useState(() => new Set())
  const [skipped, setSkipped] = useState([])
  // Sessions logged here, by item id: what the card says until the live
  // body catches up (the public body is cached on a fingerprint).
  const [logged, setLogged] = useState({})
  // The Wrap up sheet's subject and preselected outcome, or null; and the
  // games wrapped up here, gone from the cards before the body catches up.
  const [wrap, setWrap] = useState(null)
  const [wrapped, setWrapped] = useState(() => new Set())
  // Comics and movies started from a lane here, gone before the refetch.
  const [started, setStarted] = useState(() => new Set())
  const [error, setError] = useState(false)
  // A write that landed but has something to say (a rating that did not
  // save), in the server's own words rather than the generic failure.
  const [note, setNote] = useState(null)
  const [announcement, setAnnouncement] = useState('')
  const writing = useRef(null)
  const focusNext = useRef(null)
  const section = useRef(null)

  useEffect(() => {
    if (!signedIn) return undefined
    let cancelled = false
    apiFetch('/api/picker/skipped-today')
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled && Array.isArray(body?.item_ids)) {
          setHidden(new Set(body.item_ids))
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [signedIn])

  // Focus follows the action (after the render it caused), never to body.
  useEffect(() => {
    const target = focusNext.current
    if (!target || !section.current) return
    focusNext.current = null
    const root = section.current
    const element =
      (target.undo &&
        root.querySelector(`[data-tonight-undo="${target.undo}"]`)) ||
      (target.title &&
        root.querySelector(`[data-tonight-title="${target.title}"]`)) ||
      root.querySelector('.tonight-lead [data-tonight-title]') ||
      root.querySelector('h2')
    element.focus()
  })

  const today = localToday()
  // The games in hand. One answered "not tonight" today stays out (hidden)
  // or stands as a toast (skipped); a pinned game that is being played is
  // a Continue card, never the Up next lead.
  const inHand = new Set(tonight.continuing.map((card) => card.item_id))
  const cards = tonight.continuing
    .filter((card) => !hidden.has(card.item_id) && !wrapped.has(card.item_id))
    .map((card) => {
      const bump = logged[card.item_id]
      if (!bump) return card
      return {
        ...card,
        sessions: Math.max(card.sessions, bump.sessions),
        last_played_on:
          card.last_played_on > today ? card.last_played_on : today,
        stale: false,
      }
    })
  const leading = cards.some((card) => !skipped.includes(card.item_id))
  const pinnedGame = pin === undefined ? tonight.up_next : pin
  const upNext =
    pinnedGame && !inHand.has(pinnedGame.item_id) ? pinnedGame : null
  const open = tonight.picks.filter(
    (pick) => pick.item_id !== upNext?.item_id && !hidden.has(pick.item_id),
  )
  const lead =
    upNext ?? open.find((pick) => !skipped.includes(pick.item_id)) ?? null
  const alts = open.filter((pick) => pick.item_id !== lead?.item_id)
  // Two columns (the lead and Read next, then Or instead) only when there
  // are others to put beside the lead.
  const split = !leading && alts.length > 0
  const leadId = lead?.item_id ?? null
  const leadTitle = lead?.title ?? null
  // Pick for me leaves Tonight's lead out; the page holds it for the band.
  useEffect(() => {
    onLead?.(leadId ? { id: leadId, title: leadTitle } : null)
  }, [leadId, leadTitle, onLead])
  const laneOpen = (picks) =>
    picks.filter(
      (pick) => !hidden.has(pick.item_id) && !started.has(pick.item_id),
    )

  /** One write at a time: a second press while one is out is ignored. */
  async function write(path, method, body) {
    const response = await apiFetch(path, {
      method,
      ...(body && {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    })
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status}`)
  }

  /**
   * One write at a time: a second press while one is out is ignored, except
   * an Undo, which focus lands on while its skip is still being saved and so
   * waits for it instead.
   */
  async function act(optimistic, request, rollback, confirm, wait = false) {
    if (writing.current && !wait) return
    const before = writing.current
    let done
    const mine = new Promise((resolve) => (done = resolve))
    writing.current = mine
    setError(false)
    setNote(null)
    optimistic()
    try {
      await before
      await request()
      if (confirm) await confirm()
    } catch {
      rollback()
      setError(true)
    } finally {
      done()
      if (writing.current === mine) writing.current = null
    }
  }

  function play(pick) {
    const before = pin
    const wasSkipped = skipped
    act(
      () => {
        setPin(pick)
        setSkipped((ids) => ids.filter((id) => id !== pick.item_id))
        // Playing a game wrapped up here puts it back in hand, so the
        // overlay hiding its Continue card no longer holds.
        setWrapped((ids) => {
          if (!ids.has(pick.item_id)) return ids
          const next = new Set(ids)
          next.delete(pick.item_id)
          return next
        })
        focusNext.current = { title: pick.item_id }
      },
      () => write(pinPath(pick.item_id), 'POST'),
      () => {
        setPin(before)
        setSkipped(wasSkipped)
        focusNext.current = { title: pick.item_id }
      },
      async () => {
        if (await onRefresh()) setPin(undefined)
      },
    )
  }

  function unpin(pick) {
    const before = pin
    act(
      () => {
        setPin(null)
        focusNext.current = { lead: true }
      },
      () => write(`/api/items/${pick.item_id}/pin`, 'DELETE'),
      () => {
        setPin(before)
        focusNext.current = { title: pick.item_id }
      },
      async () => {
        if (await onRefresh()) setPin(undefined)
      },
    )
  }

  function skip(pick) {
    act(
      () => {
        setSkipped((ids) => [...ids, pick.item_id])
        setAnnouncement(`${pick.title} ${copy.tonight.skipped}`)
        focusNext.current = { undo: pick.item_id }
      },
      () =>
        write('/api/picker/events', 'POST', {
          item_id: pick.item_id,
          action: 'skipped',
        }),
      () => {
        setSkipped((ids) => ids.filter((id) => id !== pick.item_id))
        focusNext.current = { title: pick.item_id }
      },
    )
  }

  /** A lane's "Read this tonight" / "Watch this tonight": the item moves to
   *  Active, as the shelf's status control would move it. */
  function start(pick) {
    act(
      () => {
        setStarted((ids) => new Set([...ids, pick.item_id]))
        focusNext.current = { lead: true }
      },
      async () => {
        const response = await setStatus(pick.item_id, 'active')
        if (!response.ok) throw new Error(`status: ${response.status}`)
      },
      () => {
        setStarted((ids) => {
          const next = new Set(ids)
          next.delete(pick.item_id)
          return next
        })
        focusNext.current = { title: pick.item_id }
      },
      async () => {
        // The move is saved; only the refetch failed, as after Wrap up.
        if (!(await onRefresh())) setError(true)
      },
    )
  }

  function undo(pick) {
    act(
      () => {
        setSkipped((ids) => ids.filter((id) => id !== pick.item_id))
        setAnnouncement('')
        focusNext.current = { title: pick.item_id }
      },
      () => write(`/api/picker/events/${pick.item_id}/skipped`, 'DELETE'),
      () => {
        setSkipped((ids) => [...ids, pick.item_id])
        focusNext.current = { undo: pick.item_id }
      },
      undefined,
      true,
    )
  }

  function logTonight(card) {
    const before = logged
    act(
      () => {
        setLogged((current) => ({
          ...current,
          [card.item_id]: { sessions: card.sessions + 1 },
        }))
        setAnnouncement(copy.tonight.sessionLogged)
        focusNext.current = { title: card.item_id }
      },
      () =>
        write(`/api/items/${card.item_id}/sessions`, 'POST', {
          played_on: today,
        }),
      () => {
        setLogged(before)
        focusNext.current = { title: card.item_id }
      },
      async () => {
        await onRefresh()
      },
    )
  }

  /** The sheet saved: the card leaves, the result is announced, the body
   *  is refetched (the chip and the picks come from it). A rating that did
   *  not save is said in its own words: the game itself is marked. */
  async function wrapDone({ item, status, ratingFailed }) {
    setWrap(null)
    setWrapped((ids) => new Set([...ids, item.id]))
    setAnnouncement(copy.tonight.sheet.done(item.title, status))
    setNote(ratingFailed ? copy.tonight.sheet.ratingFailed : null)
    focusNext.current = { lead: true }
    if (!(await onRefresh())) setError(true)
  }

  const owner = signedIn ? { onPlay: play, onSkip: skip } : {}
  const laneOwner = signedIn
    ? { onPlay: start, onSkip: skip, onUndo: undo, skipped }
    : {}
  const cardOwner = signedIn
    ? {
        signedIn: true,
        onWrapUp: (card, preselect) =>
          setWrap({
            item: {
              id: card.item_id,
              title: card.title,
              cover_url: card.cover_url,
              type: card.type,
            },
            preselect,
          }),
        onLogTonight: logTonight,
        onSkip: skip,
      }
    : {}
  return (
    <section
      className={`next-section tonight${split ? ' tonight-split' : ''}`}
      aria-labelledby="next-tonight"
      ref={section}
    >
      <h2 id="next-tonight" tabIndex={-1}>
        {copy.sections.tonight}
      </h2>
      {!leading && tonight.last_finish && (
        <JustFinishedChip finish={tonight.last_finish} />
      )}
      {leading ? (
        <>
          <ul className="tonight-continuing">
            {cards.map((card) =>
              skipped.includes(card.item_id) ? (
                <SkippedToast key={card.item_id} pick={card} onUndo={undo} />
              ) : (
                <ContinueCard
                  key={card.item_id}
                  card={card}
                  to={itemPath(card.item_id)}
                  loggedToday={card.last_played_on === today}
                  {...cardOwner}
                />
              ),
            )}
          </ul>
          <PickList
            picks={open}
            upNext={upNext}
            skipped={skipped}
            onUndo={undo}
            {...owner}
          />
        </>
      ) : (
        <>
          <div className="tonight-main">
            {cards.length > 0 && (
              <ul className="tonight-continuing">
                {cards.map((card) => (
                  <SkippedToast key={card.item_id} pick={card} onUndo={undo} />
                ))}
              </ul>
            )}
            {lead ? (
              <TonightLead
                key={lead.item_id}
                pick={lead}
                pinned={Boolean(upNext)}
                signedIn={signedIn}
                onPlay={play}
                onSkip={skip}
                onUnpin={unpin}
              />
            ) : tonight.picks.length === 0 ? (
              <p className="empty-box">
                {copy.empty.games.before}{' '}
                <a href="#pick-for-me">{copy.empty.games.link}</a>
                {copy.empty.games.after}
              </p>
            ) : (
              <p className="muted">{copy.empty.upNext}</p>
            )}
          </div>
          {alts.length > 0 && (
            <div className="tonight-more">
              {alts.some((pick) => !skipped.includes(pick.item_id)) && (
                <p className="tonight-alts-h">
                  <span>
                    {upNext ? copy.tonight.otherPicks : copy.tonight.orInstead}
                  </span>
                  <span className="muted">{copy.tonight.pickedLive}</span>
                </p>
              )}
              <ul className="tonight-alts">
                {alts.map((pick) =>
                  skipped.includes(pick.item_id) ? (
                    <SkippedToast
                      key={pick.item_id}
                      pick={pick}
                      onUndo={undo}
                    />
                  ) : (
                    <TonightAlt key={pick.item_id} pick={pick} {...owner} />
                  ),
                )}
              </ul>
            </div>
          )}
        </>
      )}
      <div className="tonight-lanes">
        <Lane
          title={copy.tonight.readNext}
          caption={copy.tonight.readNextCaption}
          verb={copy.tonight.readTonight}
          picks={laneOpen(tonight.read_next)}
          {...laneOwner}
        />
        <Lane
          title={copy.tonight.watchNext}
          caption={copy.tonight.watchNextCaption}
          verb={copy.tonight.watchTonight}
          picks={laneOpen(tonight.watch_next)}
          {...laneOwner}
        />
      </div>
      {(error || note) && (
        <p className="admin-error" role="alert">
          {error ? ACTION_ERROR : note}
        </p>
      )}
      {signedIn && (
        <>
          <p className="tonight-owner-note">{copy.tonight.ownerNote}</p>
          <p className="visually-hidden" role="status">
            {announcement}
          </p>
          <WrapUpSheet
            subject={wrap}
            onClose={() => setWrap(null)}
            onDone={wrapDone}
          />
        </>
      )}
    </section>
  )
}

/**
 * What's next (Spine Next spec, C11): tonight's games from the shelf, the
 * want list, and what to look for in a store, from GET /api/public/next.
 * Paints the build-time snapshot first; the waking line only without
 * one. Signed out it is read-only; signed in, Tonight's cards take the
 * owner's answers. Never a store, price or stock.
 */
export default function Next() {
  usePageTitle(`${copy.title} · ${spine.name}`)
  const { signedIn = false } = useOutletContext() ?? {}
  const { data: loaded, failed, retry } = useSnapshotThenLive('next')
  const { data: pickTable } = useSnapshotThenLive('pick-for-me')
  // A live body fetched after an owner's write outranks the page's first.
  const [refreshed, setRefreshed] = useState(null)
  const body = refreshed ?? loaded
  const data = body ? withLists(body) : null
  // Comic Vine's terms ask for the credit wherever its data shows (AC11).
  const showsComics = Boolean(
    data &&
    (data.comics_this_week.length ||
      data.wanted.some((row) => row.type === 'comic')),
  )
  const [sort, setSort] = useState(storedSort)
  // Tonight's lead ({id, title}), which Pick for me leaves out.
  const [lead, setLead] = useState(null)
  const pickTableValid =
    Boolean(data) && isValidSnapshot('pick-for-me', pickTable)
  const jumps = data ? jumpItems(data, pickTableValid) : []
  const [skipOpen, setSkipOpen] = useState(false)
  const hasSkip = Boolean(data && data.not_on_cartridge.length > 0)

  // A link to Not on cartridge (the jump row's, or a shared URL) opens the
  // disclosure and lands on what is in it; a closed one would show a lone
  // summary line. A repeat click leaves the hash as it was, so the click is
  // handled as well as the hash.
  function openSkip() {
    setSkipOpen(true)
    requestAnimationFrame(() =>
      document
        .getElementById('next-not_on_cartridge')
        ?.scrollIntoView?.({ block: 'start' }),
    )
  }

  useEffect(() => {
    if (!hasSkip) return
    function openIfTargeted() {
      if (window.location.hash === '#next-not_on_cartridge') openSkip()
    }
    openIfTargeted()
    window.addEventListener('hashchange', openIfTargeted)
    return () => window.removeEventListener('hashchange', openIfTargeted)
  }, [hasSkip])

  /** Refetches the live body; true when it arrived. */
  async function refresh() {
    try {
      const response = await apiFetch('/api/public/next')
      const next = response.ok ? await response.json() : null
      if (!isValidSnapshot('next', next)) return false
      setRefreshed(next)
      return true
    } catch {
      return false
    }
  }

  function changeSort({ value }) {
    setSort(value)
    writeShelfPref(SORT_KEY, value)
  }

  return (
    <section className="next-page">
      <SpineHeader asLink />
      <h1 className="next-title">{copy.title}</h1>
      <p className="spine-lede">{copy.lede}</p>
      {data && <Freshness generated={data.generated_at} />}

      {!data && <LoadState loading={!failed} failed={failed} onRetry={retry} />}

      {data && (
        <>
          <JumpNav
            items={jumps}
            onJump={(id) => id === 'next-not_on_cartridge' && openSkip()}
          />
          <Tonight
            tonight={data.tonight}
            signedIn={signedIn}
            onRefresh={refresh}
            onLead={setLead}
          />
          {pickTableValid && <PickForMe table={pickTable} lead={lead} />}
          <ComicsThisWeek rows={data.comics_this_week} />
          <Section id="wanted" count={data.wanted.length}>
            <Rows
              rows={data.wanted}
              section="wanted"
              label={copy.sections.wanted}
            />
          </Section>
          <Section
            id="buy_now"
            count={data.buy_now.length}
            head={
              <SortControl
                label={copy.sortLabel}
                value={sort}
                direction="desc"
                sorts={SORTS}
                directional={false}
                onChange={changeSort}
              />
            }
          >
            <Rows
              rows={sortBuyNow(data.buy_now, sort)}
              section="buy_now"
              topPicks={TOP_PICKS_SHOWN}
              label={copy.sections.buy_now}
            />
          </Section>
          <Section id="preorders" count={data.preorders.length}>
            <Rows
              rows={data.preorders}
              section="preorders"
              label={copy.sections.preorders}
            />
          </Section>
          <Section id="later" count={data.later.length}>
            <Rows
              rows={data.later}
              section="later"
              label={copy.sections.later}
            />
          </Section>
          {data.not_on_cartridge.length > 0 && (
            <details
              className="next-skip"
              id="next-not_on_cartridge"
              open={skipOpen}
              onToggle={(event) => setSkipOpen(event.currentTarget.open)}
            >
              <summary>
                {copy.sections.not_on_cartridge} ({data.not_on_cartridge.length}
                )
              </summary>
              <p className="muted">{copy.notOnCartridge}</p>
              <Rows
                rows={data.not_on_cartridge}
                section="not_on_cartridge"
                label={copy.sections.not_on_cartridge}
              />
            </details>
          )}
        </>
      )}

      <footer className="attribution">
        <p>
          {copy.attribution.before}{' '}
          <a href="https://www.igdb.com/" rel="noreferrer noopener">
            {copy.attribution.label}
          </a>
          {copy.attribution.after}
        </p>
        {showsComics && (
          <p>
            {copy.comics.attribution.before}{' '}
            <a href="https://comicvine.gamespot.com/" rel="noreferrer noopener">
              {copy.comics.attribution.label}
            </a>
            {copy.comics.attribution.after}
          </p>
        )}
      </footer>
    </section>
  )
}
