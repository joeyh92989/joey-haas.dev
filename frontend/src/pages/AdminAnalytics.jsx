import { useEffect, useState } from 'react'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import BarList from '../components/BarList.jsx'
import DayBars from '../components/DayBars.jsx'
import Panel from '../components/Panel.jsx'
import RangeControl from '../components/RangeControl.jsx'
import StatTile, { StatTiles } from '../components/StatTile.jsx'
import { dayLabel } from '../lib/analytics.js'
import { apiFetch } from '../lib/api.js'

/** The range shown first. */
const DEFAULT_RANGE = '30d'

/** The Page views tile's detail per fixed range; All reads its start. */
const SPAN_WORDS = {
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  '90d': 'last 90 days',
}

const DEVICE_NAMES = { desktop: 'Desktop', phone: 'Phone', tablet: 'Tablet' }

/** A referrer's label: the empty value is the visits that named none. */
const referrerName = (value) => value || 'Direct / none'

/** What went wrong, in words, for a read that did not answer 200. */
function failureWords(response) {
  if (response?.status === 401 || response?.status === 403) {
    return 'Your session ended. Reload to sign in.'
  }
  return 'The analytics couldn’t be read.'
}

/**
 * First-party page analytics, at /admin/analytics: four tiles, views per
 * UTC day and the pages, referrers and devices over a range. One read per
 * range; the API counts today live and earlier days from the nightly
 * rollup, so the page never waits on the job.
 */
export default function AdminAnalytics() {
  const [range, setRange] = useState(DEFAULT_RANGE)
  // The body for `loaded`, kept while another range loads so the page
  // does not empty out between them.
  const [data, setData] = useState(null)
  const [loaded, setLoaded] = useState(null)
  const [error, setError] = useState(null)
  const loading = loaded !== range && !error

  useEffect(() => {
    let live = true
    apiFetch(`/api/analytics?range=${range}`)
      .then(async (response) => {
        if (!response.ok) throw response
        const body = await response.json()
        if (!live) return
        setData(body)
        setLoaded(range)
        setError(null)
      })
      .catch((failure) => {
        if (live) setError(failureWords(failure))
      })
    return () => {
      live = false
    }
  }, [range])

  function changeRange(next) {
    setError(null)
    setRange(next)
  }

  const best = data?.best_day
  // What a list shows before its first body: not "None yet", which is a count.
  const pending = <p className="muted">{error ? '—' : 'Loading…'}</p>
  const span =
    data && (SPAN_WORDS[data.range] ?? `since ${dayLabel(data.start)}`)

  return (
    <section className="analytics" aria-busy={loading}>
      <AdminPageHeader
        title="Analytics"
        description="Page views on the public site, counted without cookies."
      >
        <RangeControl value={range} onChange={changeRange} />
      </AdminPageHeader>

      {error && (
        <p role="alert" className="muted">
          {error}
        </p>
      )}

      <StatTiles label="Analytics figures">
        <StatTile
          label="Page views"
          value={data ? data.views : '—'}
          detail={span}
        />
        <StatTile
          label="Visitors"
          value={data ? data.visitors : '—'}
          detail="daily-salted hash, no cookies"
        />
        <StatTile
          label="Views per visitor"
          value={data ? data.views_per_visitor : '—'}
          detail="views ÷ visitors"
        />
        <StatTile
          label="Best day"
          value={best ? best.views : data ? 0 : '—'}
          detail={
            best
              ? [dayLabel(best.day, { weekday: true }), best.referrer]
                  .filter(Boolean)
                  .join(' · ')
              : data && 'No views yet'
          }
        />
      </StatTiles>

      <Panel
        title="Views per day"
        action={<span className="kicker">UTC days</span>}
      >
        {!data ? (
          <p className="muted">{error ? '—' : 'Loading…'}</p>
        ) : data.views ? (
          <DayBars series={data.series} />
        ) : (
          <div className="analytics-empty">
            <p>No views yet. The beacon is running. Check back tomorrow.</p>
            <p className="muted">
              Live since {dayLabel(data.live_since, { weekday: true })}.
            </p>
          </div>
        )}
      </Panel>

      <div className="analytics-two">
        <Panel title="Pages" action={<span className="kicker">views</span>}>
          {data ? (
            <BarList label="Pages by views" rows={data.pages} />
          ) : (
            pending
          )}
        </Panel>
        <div>
          <Panel
            title="Referrers"
            action={<span className="kicker">visitors</span>}
          >
            {data ? (
              <BarList
                label="Referrers by visitors"
                rows={data.referrers}
                name={referrerName}
              />
            ) : (
              pending
            )}
          </Panel>
          <Panel title="Devices" action={<span className="kicker">views</span>}>
            {data ? (
              <BarList
                label="Devices by views"
                rows={data.devices}
                name={(value) => DEVICE_NAMES[value] ?? value}
              />
            ) : (
              pending
            )}
          </Panel>
        </div>
      </div>

      <p className="analytics-note">
        Counted from a cookie-free beacon on each public page; your own
        signed-in visits are left out. A visitor is a hash of the connection
        under a salt that changes at midnight UTC, so one person on two days
        counts twice. The free API sleeps when idle, and a view sent while it
        wakes can be lost, so the first visit after a quiet spell may go
        uncounted.
      </p>
    </section>
  )
}
