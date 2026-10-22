import { Link } from 'react-router'
import CoverImage from '../components/CoverImage.jsx'
import NextRow from '../components/NextRow.jsx'
import SpineHeader from '../components/SpineHeader.jsx'
import Stop from '../components/Stop.jsx'
import StopIndex from '../components/StopIndex.jsx'
import { spine } from '../content/spine.js'
import { useHashFocus } from '../lib/useHashFocus.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'
import { itemPath } from '../lib/spinePaths.js'
import { TonightCard } from './Next.jsx'

const copy = spine.how
const NEWEST = 4

const list = (value) => (Array.isArray(value) ? value : [])

/** The newest games on the shelf: public, owned (not wanted), newest first. */
function newestGames(items) {
  return list(items)
    .filter((item) => item.type === 'game' && !item.wanted)
    .sort((a, b) => String(b.created_at).localeCompare(a.created_at))
    .slice(0, NEWEST)
}

/** A full cartridge (a top pick first) and a row I skip, for stop 2. */
function formatRows(next) {
  const carts = ['buy_now', 'preorders', 'later'].flatMap((section) =>
    list(next?.[section])
      .filter((row) => row.physical_format === 'game_card')
      .map((row) => ({ row, section })),
  )
  const cart = carts.find(({ row }) => row.top_pick) ?? carts[0]
  const skip = list(next?.not_on_cartridge)[0]
  return [cart, skip && { row: skip, section: 'not_on_cartridge' }].filter(
    Boolean,
  )
}

/** One upcoming cartridge and one further out, for stop 4. */
function radarRows(next) {
  return ['preorders', 'later']
    .map((section) => {
      const row = list(next?.[section])[0]
      return row && { row, section }
    })
    .filter(Boolean)
}

const COUNT = new Intl.NumberFormat('en')

/** Stop 2 with the catalog's live counts, once the status has answered. */
function withCounts(stop, status) {
  if (stop.n !== 2 || !stop.capture?.facts || !status) return stop
  const counts = copy.counts
  const facts = stop.capture.facts.map(([label, value]) =>
    label === counts.stores
      ? [
          label,
          counts.listings(status.stores_watched, COUNT.format(status.listings)),
        ]
      : [label, value],
  )
  const catalog = [
    counts.catalog,
    counts.titles(COUNT.format(status.titles), status.platforms),
  ]
  return { ...stop, capture: { ...stop.capture, facts: [catalog, ...facts] } }
}

/**
 * A live box's body: the rows once there are some, the stop's empty line
 * once the source has answered without any, and a loading line until then.
 */
function Live({ state, empty, children, count }) {
  if (count > 0) return children
  if (!state.data && !state.failed) {
    return <p className="muted">{spine.next.loading}</p>
  }
  return <p className="muted">{empty}</p>
}

function NewestCovers({ games }) {
  return (
    <ul className="tour-covers">
      {games.map((game) => (
        <li key={game.id}>
          <Link to={itemPath(game.id)}>
            <CoverImage src={game.cover_url} type={game.type} alt="" />
            <span className="tour-cover-title">{game.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Rows({ rows }) {
  return (
    <ul className="next-rows">
      {rows.map(({ row, section }) => (
        <NextRow key={section} row={row} section={section} />
      ))}
    </ul>
  )
}

/**
 * /spine/how, the field guide (Spine tour spec): eight stops, each with the
 * public result live beside a drawing of the signed-in tool that made it.
 * The live halves read the same snapshot-then-live bodies as the shelf and
 * What's next, so the page paints while the API is asleep; the drawings
 * are copy, so no private figure is ever fetched.
 */
export default function HowItWorks() {
  usePageTitle(`${spine.tabs.how.label} · ${spine.name}`)
  useHashFocus()
  const items = useSnapshotThenLive('items')
  const next = useSnapshotThenLive('next')
  const status = useSnapshotThenLive('status')

  const games = newestGames(items.data)
  const formats = formatRows(next.data)
  const radar = radarRows(next.data)
  const tonight = next.data?.tonight
  const upNext = tonight?.up_next ?? null
  const [firstPick, ...otherPicks] = list(tonight?.picks)

  const live = {
    1: (
      <Live state={items} empty={copy.stops[0].live.empty} count={games.length}>
        <NewestCovers games={games} />
      </Live>
    ),
    2: (
      <Live
        state={next}
        empty={copy.stops[1].live.empty}
        count={formats.length}
      >
        <Rows rows={formats} />
      </Live>
    ),
    3: (
      <Live
        state={next}
        empty={copy.stops[2].live.empty}
        count={Number(Boolean(upNext)) + Number(Boolean(firstPick))}
      >
        <ul className="next-rows next-tonight">
          {upNext && <TonightCard pick={upNext} label={spine.next.upNext} />}
          {firstPick && <TonightCard pick={firstPick} label={null} />}
        </ul>
        {otherPicks.length > 0 && (
          <NewestCovers
            games={otherPicks.map((pick) => ({ ...pick, id: pick.item_id }))}
          />
        )}
      </Live>
    ),
    4: (
      <Live state={next} empty={copy.stops[3].live.empty} count={radar.length}>
        <Rows rows={radar} />
      </Live>
    ),
  }

  return (
    <section className="tour-page">
      <SpineHeader asLink />
      <h1 className="tour-title">{copy.title}</h1>
      <p className="tour-lede">{copy.lede}</p>
      <StopIndex />
      {copy.stops.map((stop) => (
        <Stop key={stop.n} stop={withCounts(stop, status.data)}>
          {live[stop.n]}
        </Stop>
      ))}
      <p className="tour-closing">
        <Link to={copy.closing.longVersion.to}>
          {copy.closing.longVersion.label}
        </Link>
        <a href={copy.closing.source.href}>{copy.closing.source.label}</a>
        <Link to={copy.closing.shelf.to}>{copy.closing.shelf.label}</Link>
      </p>
    </section>
  )
}
