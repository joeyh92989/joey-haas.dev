import { useState } from 'react'
import BarList from '../components/BarList.jsx'
import DayBars from '../components/DayBars.jsx'
import LoadState from '../components/LoadState.jsx'
import StatTile, { StatTiles } from '../components/StatTile.jsx'
import { CHANGELOG, renderLine } from '../content/changelog.js'
import {
  COUNTED,
  FROM_SNAPSHOT,
  LEDE,
  LIVE_AS_OF,
  STATS_TITLE,
} from '../content/stats.js'
import { deviceName, referrerName, showsAllTime } from '../lib/analytics.js'
import { pageName, usePageTitles } from '../lib/pageTitles.js'
import { useHashFocus } from '../lib/useHashFocus.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'
import { DAY_YEAR as CHANGE_DATE, TIME } from '../lib/formatDate.js'
import PageHeader from '../components/PageHeader.jsx'
import { buttonVariants } from '../components/ui/button-variants.js'
import { Card } from '../components/ui/card.jsx'

/** A chart's card: flat, the bars inside with their own rules. */
const LIST_CARD = 'gap-0 px-4 py-2'

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
 * lists are the last thirty days; the tiles add all time once counting
 * is more than thirty days old.
 */
export default function Stats() {
  usePageTitle(STATS_TITLE)
  useHashFocus()
  const { data, live, failed, retry } = useSnapshotThenLive('site-stats')
  // When the live answer landed: stamped in the render that first sees
  // `live`, React's pattern for state derived from a changed input.
  const [liveAt, setLiveAt] = useState(null)
  if (live && liveAt === null) setLiveAt(new Date())
  const titles = usePageTitles()

  const status = liveAt ? LIVE_AS_OF(TIME.format(liveAt)) : FROM_SNAPSHOT
  const thirty = data?.thirty

  return (
    <section className="site-stats">
      <PageHeader title="Stats" lede={LEDE} ledeClassName="prose" />

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
            {showsAllTime(data.all.live_since) && (
              <>
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
              </>
            )}
          </StatTiles>
          {failed ? (
            <LoadState failed stale live={live} onRetry={retry} />
          ) : (
            <p className="muted site-stats-status" role="status">
              {status}
            </p>
          )}

          <h2>Views per day</h2>
          {thirty.views ? (
            <Card className="site-stats-days gap-0 px-4 py-4">
              <DayBars series={thirty.series} />
            </Card>
          ) : (
            <p className="muted">No views in the last 30 days.</p>
          )}

          <div className="site-stats-lists">
            <section aria-labelledby="stats-pages">
              <h2 id="stats-pages">Pages</h2>
              <span className="kicker">views, last 30 days</span>
              <Card className={LIST_CARD}>
                <BarList
                  label="Pages by views"
                  rows={thirty.pages}
                  name={(path) => pageName(titles, path)}
                />
              </Card>
            </section>
            <section aria-labelledby="stats-referrers">
              <h2 id="stats-referrers">Referrers</h2>
              <span className="kicker">visitors, last 30 days</span>
              <Card className={LIST_CARD}>
                <BarList
                  label="Referrers by visitors"
                  rows={referrerRows(thirty)}
                  name={referrerLabel}
                />
              </Card>
            </section>
            <section aria-labelledby="stats-devices">
              <h2 id="stats-devices">Devices</h2>
              <span className="kicker">views, last 30 days</span>
              <Card className={LIST_CARD}>
                <BarList
                  label="Devices by views"
                  rows={thirty.devices}
                  name={deviceName}
                />
              </Card>
            </section>
          </div>
        </>
      ) : (
        <LoadState loading={!failed} failed={failed} onRetry={retry} />
      )}

      <h2>How this is counted</h2>
      <p className="prose">{COUNTED.join(' ')}</p>

      <section id="changes" aria-labelledby="changes-title">
        <h2 id="changes-title">Changes</h2>
        <p className="changes-feed">
          <a
            href="/changelog.xml"
            className={buttonVariants({ variant: 'outline', size: 'xs' })}
          >
            RSS
          </a>
        </p>
        <ol className="changelog" role="list">
          {CHANGELOG.map((entry) => (
            <li key={entry.date}>
              <Card className="gap-2 px-4 py-3">
                <time dateTime={entry.date}>
                  {CHANGE_DATE.format(new Date(`${entry.date}T00:00:00Z`))}
                </time>
                <ul>
                  {entry.lines.map((line, index) => (
                    <li key={index}>{renderLine(line)}</li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ol>
      </section>
    </section>
  )
}
