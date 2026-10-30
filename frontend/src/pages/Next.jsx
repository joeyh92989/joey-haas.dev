import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router'
import JustFinishedChip from '../components/JustFinishedChip.jsx'
import NextRow from '../components/NextRow.jsx'
import SortControl from '../components/SortControl.jsx'
import SkippedToast from '../components/SkippedToast.jsx'
import SpineHeader from '../components/SpineHeader.jsx'
import TonightAlt from '../components/TonightAlt.jsx'
import TonightLead from '../components/TonightLead.jsx'
import { ACTION_ERROR } from '../content/status.js'
import { spine } from '../content/spine.js'
import { groupByPlatform, sortBuyNow, weekdayWords } from '../lib/next.js'
import { apiFetch } from '../lib/api.js'
import { readShelfPref, writeShelfPref } from '../lib/shelf.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { isValidSnapshot } from '../lib/snapshot.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'

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
      up_next: data.tonight?.up_next ?? null,
      picks: list(data.tonight?.picks),
      last_finish: data.tonight?.last_finish ?? null,
    },
    wanted: list(data.wanted),
    buy_now: list(data.buy_now),
    preorders: list(data.preorders),
    later: list(data.later),
    not_on_cartridge: list(data.not_on_cartridge),
  }
}

function Freshness({ generated }) {
  const parts = [
    [copy.fresh.picks, generated?.picks],
    [copy.fresh.catalogue, generated?.catalogue],
    [copy.fresh.discover, generated?.discover],
  ]
    .map(([label, value]) => [label, value && weekdayWords(value)])
    .filter(([, words]) => words)
    .map(([label, words]) => `${label} ${words}`)
  if (!parts.length) return null
  return <p className="muted next-fresh">{parts.join(' · ')}</p>
}

function Section({ id, children, empty, count }) {
  return (
    <section className="next-section" aria-labelledby={`next-${id}`}>
      <h2 id={`next-${id}`}>{copy.sections[id]}</h2>
      {count === 0 ? <p className="muted">{empty}</p> : children}
    </section>
  )
}

function Rows({ rows, section }) {
  return (
    <ul className="next-rows">
      {rows.map((row, index) => (
        <NextRow key={rowKey(row, index)} row={row} section={section} />
      ))}
    </ul>
  )
}

/**
 * Tonight (Tonight picks spec): the Just finished chip, the lead card, and
 * the other picks under it. Signed in, each card can be pinned ("Play
 * this") or skipped ("Not tonight"); writes are optimistic, and a pin is
 * confirmed by a live refetch through `onRefresh`. A skip changes nothing
 * public until the next day's picks, so games skipped earlier today come
 * from `/api/picker/skipped-today` and are left out here.
 */
function Tonight({ tonight, signedIn, onRefresh }) {
  // undefined: the body's Up next; null: unpinned here; a pick: pinned here.
  const [pin, setPin] = useState(undefined)
  const [hidden, setHidden] = useState(() => new Set())
  const [skipped, setSkipped] = useState([])
  const [error, setError] = useState(false)
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

  const upNext = pin === undefined ? tonight.up_next : pin
  const open = tonight.picks.filter(
    (pick) => pick.item_id !== upNext?.item_id && !hidden.has(pick.item_id),
  )
  const lead =
    upNext ?? open.find((pick) => !skipped.includes(pick.item_id)) ?? null
  const alts = open.filter((pick) => pick.item_id !== lead?.item_id)

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
        focusNext.current = { title: pick.item_id }
      },
      () => write(`/api/items/${pick.item_id}/pin`, 'POST'),
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

  const owner = signedIn ? { onPlay: play, onSkip: skip } : {}
  return (
    <section
      className="next-section tonight"
      aria-labelledby="next-tonight"
      ref={section}
    >
      <h2 id="next-tonight" tabIndex={-1}>
        {copy.sections.tonight}
      </h2>
      {tonight.last_finish && <JustFinishedChip finish={tonight.last_finish} />}
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
      ) : (
        <p className="muted">{copy.empty.upNext}</p>
      )}
      {alts.length > 0 && (
        <>
          {alts.some((pick) => !skipped.includes(pick.item_id)) && (
            <p className="tonight-alts-h">
              {upNext ? copy.tonight.otherPicks : copy.tonight.orInstead}
            </p>
          )}
          <ul className="tonight-alts">
            {alts.map((pick) =>
              skipped.includes(pick.item_id) ? (
                <SkippedToast key={pick.item_id} pick={pick} onUndo={undo} />
              ) : (
                <TonightAlt key={pick.item_id} pick={pick} {...owner} />
              ),
            )}
          </ul>
        </>
      )}
      {tonight.picks.length === 0 && (
        <p className="muted">{copy.empty.picks}</p>
      )}
      {error && (
        <p className="admin-error" role="alert">
          {ACTION_ERROR}
        </p>
      )}
      {signedIn && (
        <>
          <p className="tonight-owner-note">{copy.tonight.ownerNote}</p>
          <p className="visually-hidden" role="status">
            {announcement}
          </p>
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
  const { data: loaded, failed } = useSnapshotThenLive('next')
  // A live body fetched after an owner's write outranks the page's first.
  const [refreshed, setRefreshed] = useState(null)
  const body = refreshed ?? loaded
  const data = body ? withLists(body) : null
  const [sort, setSort] = useState(storedSort)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 3000)
    return () => clearTimeout(timer)
  }, [])

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

      {!data && !failed && (
        <p className="muted" role="status">
          {slow ? copy.waking : copy.loading}
        </p>
      )}
      {!data && failed && (
        <p className="admin-error" role="alert">
          {copy.error}
        </p>
      )}

      {data && (
        <>
          <Tonight
            tonight={data.tonight}
            signedIn={signedIn}
            onRefresh={refresh}
          />
          <Section
            id="wanted"
            count={data.wanted.length}
            empty={copy.empty.wanted}
          >
            <Rows rows={data.wanted} section="wanted" />
          </Section>
          <Section
            id="buy_now"
            count={data.buy_now.length}
            empty={copy.empty.buy_now}
          >
            <SortControl
              label={copy.sortLabel}
              value={sort}
              direction="desc"
              sorts={SORTS}
              directional={false}
              onChange={changeSort}
            />
            {groupByPlatform(sortBuyNow(data.buy_now, sort)).map((group) => (
              <div key={group.platform} className="next-group">
                <h3>{group.platform}</h3>
                <Rows rows={group.rows} section="buy_now" />
              </div>
            ))}
          </Section>
          <Section
            id="preorders"
            count={data.preorders.length}
            empty={copy.empty.preorders}
          >
            <Rows rows={data.preorders} section="preorders" />
          </Section>
          <Section
            id="later"
            count={data.later.length}
            empty={copy.empty.later}
          >
            <Rows rows={data.later} section="later" />
          </Section>
          <details className="next-skip">
            <summary>
              {copy.sections.not_on_cartridge}
              {data.not_on_cartridge.length > 0 &&
                ` (${data.not_on_cartridge.length})`}
            </summary>
            <p className="muted">{copy.notOnCartridge}</p>
            {data.not_on_cartridge.length === 0 ? (
              <p className="muted">{copy.empty.not_on_cartridge}</p>
            ) : (
              <Rows rows={data.not_on_cartridge} section="not_on_cartridge" />
            )}
          </details>
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
      </footer>
    </section>
  )
}
