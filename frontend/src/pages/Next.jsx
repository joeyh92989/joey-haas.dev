import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import CoverImage from '../components/CoverImage.jsx'
import NextRow from '../components/NextRow.jsx'
import SortControl from '../components/SortControl.jsx'
import SpineHeader from '../components/SpineHeader.jsx'
import { spine } from '../content/spine.js'
import { groupByPlatform, sortBuyNow } from '../lib/next.js'
import { readShelfPref, writeShelfPref } from '../lib/shelf.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'

const copy = spine.next
const SORTS = copy.sorts.map((sort) => ({ ...sort, direction: 'desc' }))
const SORT_KEY = 'shelf.next.sort'
const DAY = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

/** A stored sort the page no longer offers falls back to Best match. */
function storedSort() {
  const value = readShelfPref(SORT_KEY, 'best')
  return SORTS.some((sort) => sort.value === value) ? value : 'best'
}

/** A date-only value is read at noon UTC, so no timezone moves its day. */
function dayWords(value) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00Z`)
    : new Date(value)
  return Number.isNaN(date.getTime()) ? null : DAY.format(date)
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
    .map(([label, value]) => [label, value && dayWords(value)])
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

function TonightCard({ pick, label }) {
  const reasons = pick.reasons ?? []
  return (
    <li className="next-row next-tonight-card">
      <Link to={`/spine/${pick.item_id}`} className="next-row-link">
        <span className="next-row-cover">
          <CoverImage src={pick.cover_url} type={pick.type} alt="" />
        </span>
        <span className="next-tonight-name">
          {label && <span className="pick-slot">{label}</span>}
          <span className="next-row-title">{pick.title}</span>
        </span>
      </Link>
      <div className="next-row-text">
        {pick.platform && <span className="muted">{pick.platform}</span>}
        {reasons.length > 0 && (
          <ul className="next-row-reasons">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}

function Tonight({ tonight }) {
  return (
    <section className="next-section" aria-labelledby="next-tonight">
      <h2 id="next-tonight">{copy.sections.tonight}</h2>
      {!tonight.up_next && <p className="muted">{copy.empty.upNext}</p>}
      {(tonight.up_next || tonight.picks.length > 0) && (
        <ul className="next-rows next-tonight">
          {tonight.up_next && (
            <TonightCard pick={tonight.up_next} label={copy.upNext} />
          )}
          {tonight.picks.map((pick) => (
            <TonightCard key={pick.item_id} pick={pick} label={null} />
          ))}
        </ul>
      )}
      {tonight.picks.length === 0 && (
        <p className="muted">{copy.empty.picks}</p>
      )}
    </section>
  )
}

/**
 * What's next (Spine Next spec, C11): tonight's games from the shelf, the
 * want list, and what to look for in a store, from GET /api/public/next.
 * Paints the build-time snapshot first; "Waking the server" only without
 * one. Read-only: no buttons that write, and no store, price or stock.
 */
export default function Next() {
  usePageTitle(`${copy.title} · ${spine.name}`)
  const { data: body, failed } = useSnapshotThenLive('next')
  const data = body ? withLists(body) : null
  const [sort, setSort] = useState(storedSort)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 3000)
    return () => clearTimeout(timer)
  }, [])

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
      {!data && failed && <p className="admin-error">{copy.error}</p>}

      {data && (
        <>
          <Tonight tonight={data.tonight} />
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
              {copy.sections.not_on_cartridge} ({data.not_on_cartridge.length})
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
          Game data from{' '}
          <a href="https://www.igdb.com/" rel="noreferrer noopener">
            IGDB
          </a>
          .
        </p>
      </footer>
    </section>
  )
}
