import { useEffect, useMemo, useState } from 'react'
import BarList from '../components/BarList.jsx'
import DayBars from '../components/DayBars.jsx'
import StatTile, { StatTiles } from '../components/StatTile.jsx'
import { CHANGELOG, renderLine } from '../content/changelog.js'
import {
  COUNTED,
  FROM_SNAPSHOT,
  FROM_SNAPSHOT_ASLEEP,
  LEDE,
  LIVE_AS_OF,
  STATS_TITLE,
} from '../content/stats.js'
import { LOAD_ERROR, WAKING } from '../content/status.js'
import { deviceName, referrerName } from '../lib/analytics.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'

const TIME = new Intl.DateTimeFormat('en', {
  hour: 'numeric',
  minute: '2-digit',
})

const CHANGE_DATE = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const figure = (count) => count.toLocaleString('en')

/** The referrer rows with the folded hosts as one last "Other" row. */
function referrerRows(summary) {
  const rows = summary.referrers
  return summary.referrers_other > 0
    ? [...rows, { value: 'other', count: summary.referrers_other }]
    : rows
}

const referrerLabel = (value) =>
  value === 'other' ? 'Other' : referrerName(value)

/**
 * Public site analytics at /stats: the figures the admin page shows, from
 * GET /api/public/site-stats, with how they are counted and the changelog.
 * Paints the build-time snapshot first and says where the figures came
 * from; the waking line only without a snapshot. The day series and the
 * lists are the last thirty days; the tiles add all time.
 */
export default function Stats() {
  usePageTitle(STATS_TITLE)
  const { data, live, failed } = useSnapshotThenLive('site-stats')
  // When the live answer landed: the moment `live` turned true.
  const liveAt = useMemo(() => (live ? new Date() : null), [live])
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 3000)
    return () => clearTimeout(timer)
  }, [])

  const status = liveAt
    ? LIVE_AS_OF(TIME.format(liveAt))
    : failed
      ? FROM_SNAPSHOT_ASLEEP
      : FROM_SNAPSHOT
  const thirty = data?.thirty

  return (
    <section className="site-stats">
      <h1>Stats</h1>
      <p className="prose">{LEDE}</p>

      {data ? (
        <>
          <StatTiles label="Site figures">
            <StatTile
              label="Views"
              value={figure(thirty.views)}
              detail="last 30 days"
            />
            <StatTile
              label="Visitors"
              value={figure(thirty.visitors)}
              detail="last 30 days"
            />
            <StatTile
              label="Views"
              value={figure(data.all.views)}
              detail="all time"
            />
            <StatTile
              label="Visitors"
              value={figure(data.all.visitors)}
              detail="all time"
            />
          </StatTiles>
          <p className="muted site-stats-status" role="status">
            {status}
          </p>

          <h2>Views per day</h2>
          {thirty.views ? (
            <div className="site-stats-days">
              <DayBars series={thirty.series} />
            </div>
          ) : (
            <p className="muted">No views in the last 30 days.</p>
          )}

          <div className="site-stats-lists">
            <section aria-labelledby="stats-pages">
              <h2 id="stats-pages">Pages</h2>
              <span className="kicker">views, last 30 days</span>
              <BarList label="Pages by views" rows={thirty.pages} />
            </section>
            <section aria-labelledby="stats-referrers">
              <h2 id="stats-referrers">Referrers</h2>
              <span className="kicker">visitors, last 30 days</span>
              <BarList
                label="Referrers by visitors"
                rows={referrerRows(thirty)}
                name={referrerLabel}
              />
            </section>
            <section aria-labelledby="stats-devices">
              <h2 id="stats-devices">Devices</h2>
              <span className="kicker">views, last 30 days</span>
              <BarList
                label="Devices by views"
                rows={thirty.devices}
                name={deviceName}
              />
            </section>
          </div>
        </>
      ) : failed ? (
        <p className="admin-error" role="alert">
          {LOAD_ERROR}
        </p>
      ) : (
        <p className="muted" role="status">
          {slow ? WAKING : 'Loading…'}
        </p>
      )}

      <h2>How this is counted</h2>
      <p className="prose">{COUNTED.join(' ')}</p>

      <h2>Changes</h2>
      <ol className="changelog">
        {CHANGELOG.map((entry) => (
          <li key={entry.date}>
            <time dateTime={entry.date}>
              {CHANGE_DATE.format(new Date(`${entry.date}T00:00:00Z`))}
            </time>
            <ul>
              {entry.lines.map((line) => (
                <li key={line}>{renderLine(line)}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  )
}
