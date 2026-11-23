import { describe, expect, it } from 'vitest'
import {
  DISCOVER_STALE_HOURS,
  JOB_INFO,
  lastNightly,
  nextRunAt,
  nightlyHeadline,
  nightlyJobs,
  relativeWords,
  STALE_HOURS,
} from './nightly.js'

const NOW = Date.parse('2026-10-05T12:00:00Z')
const run = (source, kind, finished_at, ok = true, name = source) => ({
  source,
  name,
  kind,
  last_run: finished_at
    ? { started_at: finished_at, finished_at, ok, interrupted: false }
    : null,
})
const HOUR = 3600 * 1000
const hoursAgo = (hours) => new Date(NOW - hours * HOUR).toISOString()

describe('lastNightly', () => {
  it('takes the newest nightly run and ignores Refresh N64', () => {
    const summary = lastNightly(
      {
        sources: [
          run('lrg', 'store', '2026-10-05T00:40:00Z'),
          run('nscollectors', 'registry', '2026-10-05T00:20:00Z'),
          run('igdb_platform', 'platform', '2026-10-05T09:00:00Z'),
        ],
      },
      { radar: '2026-10-05T00:44:00Z', discover: null },
      NOW,
    )
    expect(summary.catalogueAt).toBe(Date.parse('2026-10-05T00:40:00Z'))
    expect(summary.failed).toEqual([])
    expect(summary.stale).toBe(false)
    expect(summary.radarAt).toBe('2026-10-05T00:44:00Z')
  })

  it('names the sources that failed on that night only', () => {
    const summary = lastNightly(
      {
        sources: [
          run('lrg', 'store', '2026-10-05T00:40:00Z', false, 'Limited Run'),
          run('old', 'store', '2026-10-01T00:40:00Z', false, 'Old store'),
          run('resolve', 'resolve', '2026-10-05T00:42:00Z'),
        ],
      },
      {},
      NOW,
    )
    expect(summary.failed).toEqual(['Limited Run'])
  })

  it('keeps the night of the store run when a manual Resolve runs later', () => {
    const summary = lastNightly(
      {
        sources: [
          run('lrg', 'store', '2026-10-05T00:40:00Z', false, 'Limited Run'),
          run('nscollectors', 'registry', '2026-10-05T00:20:00Z'),
          run('resolve', 'resolve', '2026-10-05T11:30:00Z'),
        ],
      },
      {},
      NOW,
    )
    expect(summary.catalogueAt).toBe(Date.parse('2026-10-05T00:40:00Z'))
    expect(summary.failed).toEqual(['Limited Run'])
  })

  it('counts a recent interrupted run as failed', () => {
    const summary = lastNightly(
      {
        sources: [
          run('nscollectors', 'registry', '2026-10-05T00:20:00Z'),
          {
            source: 'lrg',
            name: 'Limited Run',
            kind: 'store',
            last_run: {
              started_at: '2026-10-05T00:25:00Z',
              finished_at: null,
              ok: null,
              interrupted: true,
            },
          },
          {
            source: 'old',
            name: 'Old store',
            kind: 'store',
            last_run: {
              started_at: hoursAgo(STALE_HOURS + 1),
              finished_at: null,
              ok: null,
              interrupted: true,
            },
          },
        ],
      },
      {},
      NOW,
    )
    expect(summary.failed).toEqual(['Limited Run'])
    expect(summary.stale).toBe(false)
  })

  it(`turns stale between ${STALE_HOURS - 1} and ${STALE_HOURS + 1} hours`, () => {
    const at = (hours) =>
      lastNightly({ sources: [run('lrg', 'store', hoursAgo(hours))] }, {}, NOW)
        .stale
    expect(at(STALE_HOURS - 1)).toBe(false)
    expect(at(STALE_HOURS + 1)).toBe(true)
  })

  it(`is stale after ${STALE_HOURS} hours, and with no runs at all`, () => {
    const old = lastNightly(
      { sources: [run('lrg', 'store', '2026-10-03T23:00:00Z')] },
      {},
      NOW,
    )
    expect(old.stale).toBe(true)
    expect(lastNightly({ sources: [] }, {}, NOW).stale).toBe(true)
  })
})

const summary = (overrides = {}) => ({
  catalogueAt: NOW - HOUR,
  failed: [],
  stale: false,
  radarAt: hoursAgo(1),
  discoverAt: hoursAgo(1),
  ...overrides,
})
const spots = (overrides = {}) => ({
  weather: { at: hoursAgo(1), state: 'ok' },
  candidates: { at: hoursAgo(1), state: 'ok' },
  ...overrides,
})
const closet = (overrides = {}) => ({
  tag: { at: hoursAgo(1), state: 'ok', ok: true, note: null },
  plan: { at: hoursAgo(1), state: 'ok', ok: true, note: null },
  opinion: { at: hoursAgo(1), state: 'ok', ok: true, note: null },
  ...overrides,
})
const intake = (run = { at: hoursAgo(1), state: 'ok', ok: true, note: null }) =>
  run
const intakeRow = (run) =>
  byKey(nightlyJobs(summary(), null, NOW, null, null, run)).intake
const comicsRun = (run = { at: hoursAgo(1), state: 'ok', ok: true }) => ({
  issues: run,
  refresh: run,
  tags: run,
})
const comicsRow = (run, key = 'comic-issues') => {
  const which = { 'comic-issues': 'issues', 'comic-refresh': 'refresh' }[key]
  return byKey(
    nightlyJobs(summary(), null, NOW, null, null, null, {
      [which ?? 'tags']: run,
    }),
  )[key]
}
const closetRow = (key, run) =>
  byKey(nightlyJobs(summary(), null, NOW, null, closet(run)))[key]
const byKey = (jobs) => Object.fromEntries(jobs.map((job) => [job.key, job]))

describe('the Comic issues row', () => {
  it('reads an ok run as synced', () => {
    const row = comicsRow({ at: hoursAgo(1), state: 'ok', ok: true })
    expect(row.state).toBe('ok')
    expect(row.summary).toBe('Every series synced')
    expect(row.runNow).toBe('/admin/pull-list')
  })

  it('says the budget ran out on a partial run', () => {
    const row = comicsRow({ at: hoursAgo(1), state: 'partial', ok: true })
    expect(row.state).toBe('ok')
    expect(row.summary).toBe('Budget spent; the rest sync tomorrow')
  })

  it("prefers a run's own note on a partial run", () => {
    const row = comicsRow({
      at: hoursAgo(1),
      state: 'partial',
      ok: true,
      note: 'Budget spent; 3 series wait',
    })
    expect(row.summary).toBe('Budget spent; 3 series wait')
  })

  it('reads a failed run as failed, with its note', () => {
    const row = comicsRow({
      at: hoursAgo(1),
      state: 'failed',
      ok: false,
      note: '1 of 4 series failed: HTTP 500',
    })
    expect(row.state).toBe('failed')
    expect(row.summary).toBe('Failed: 1 of 4 series failed: HTTP 500')
  })

  it('reads no run as No run recorded', () => {
    const row = comicsRow(null)
    expect(row.state).toBe('unknown')
    expect(row.summary).toBe('No run recorded')
  })

  it('goes stale after 36 hours', () => {
    const at = (hours) =>
      comicsRow({ at: hoursAgo(hours), state: 'ok', ok: true }).state
    expect(at(STALE_HOURS - 1)).toBe('ok')
    expect(at(STALE_HOURS + 1)).toBe('stale')
  })
})

describe('the Comic refresh row', () => {
  const row = (run) => comicsRow(run, 'comic-refresh')

  it('reads an ok run as refreshed', () => {
    const r = row({ at: hoursAgo(1), state: 'ok', ok: true })
    expect(r.state).toBe('ok')
    expect(r.summary).toBe('Followed series refreshed')
    expect(r.runNow).toBe('/admin/pull-list')
  })

  it('reads a failed run as failed, with its note', () => {
    const r = row({
      at: hoursAgo(1),
      state: 'failed',
      ok: false,
      note: '1 of 3 series failed: Saga: HTTP 500',
    })
    expect(r.state).toBe('failed')
    expect(r.summary).toBe('Failed: 1 of 3 series failed: Saga: HTTP 500')
  })

  it('reads no run as No run recorded', () => {
    expect(row(null).summary).toBe('No run recorded')
  })
})

describe('the Comic tags row', () => {
  const row = (run) => comicsRow(run, 'comic-tags')

  it('reads an ok run as tagged', () => {
    const r = row({ at: hoursAgo(1), state: 'ok', ok: true })
    expect(r.state).toBe('ok')
    expect(r.summary).toBe('Series tagged')
    expect(r.runNow).toBe('/admin/shelf/comics')
    expect(r.runWords).toBe('Open Comics')
  })

  it('says the budget ran out on a partial run, and stays ok', () => {
    const r = row({ at: hoursAgo(1), state: 'partial', ok: true })
    expect(r.state).toBe('ok')
    expect(r.summary).toBe('Budget spent; the rest tag tomorrow')
  })

  it('reads a model stop as failed, with its reason', () => {
    const r = row({
      at: hoursAgo(1),
      state: 'failed',
      ok: false,
      note: 'Tagging stopped: B: 429 quota',
    })
    expect(r.state).toBe('failed')
    expect(r.summary).toBe('Failed: Tagging stopped: B: 429 quota')
  })

  it('reads no run as No run recorded', () => {
    expect(row(null).state).toBe('unknown')
  })
})

describe('nightlyJobs', () => {
  it('lists the thirteen jobs, all ok', () => {
    const jobs = nightlyJobs(
      summary(),
      hoursAgo(1),
      NOW,
      spots(),
      closet(),
      intake(),
      comicsRun(),
    )
    expect(jobs.map((job) => job.key)).toEqual([
      'catalog',
      'radar',
      'discover',
      'weather',
      'spots',
      'closet-tags',
      'closet-plans',
      'closet-opinions',
      'intake',
      'comic-refresh',
      'comic-issues',
      'comic-tags',
      'snapshot',
    ])
    expect(jobs.every((job) => job.state === 'ok')).toBe(true)
    // A link that only navigates says where it goes, never "Run now".
    expect(jobs.map((job) => job.runWords)).toEqual([
      'Open Sources',
      'Open Radar',
      'Open Discover',
      'Open Weekend',
      'Open Spots',
      'Open Closet',
      'Open Today',
      'Open Review',
      'Open Intake',
      'Open Pull list',
      'Open Pull list',
      'Open Comics',
      undefined,
    ])
    expect(jobs.map((job) => job.runNow)).toEqual([
      '/admin/catalogue',
      '/admin/radar',
      '/admin/discover',
      '/admin/weekend',
      '/admin/spots',
      '/admin/closet',
      '/admin/closet/today',
      '/admin/closet/review',
      '/admin/collection/add',
      '/admin/pull-list',
      '/admin/pull-list',
      '/admin/shelf/comics',
      null,
    ])
  })

  it('reads a stopped or failed tag run as failed, with its note', () => {
    for (const state of ['stopped', 'failed']) {
      const row = closetRow('closet-tags', {
        tag: { at: hoursAgo(1), state, ok: false, note: 'Quota used up' },
      })
      expect(row.state).toBe('failed')
      expect(row.summary).toBe('Failed: Quota used up')
    }
  })

  it('keeps an idle tag run quiet', () => {
    const off = closetRow('closet-tags', {
      tag: { at: hoursAgo(1), state: 'off', ok: true, note: null },
    })
    expect([off.state, off.summary]).toEqual(['ok', 'Tagging is off'])
    const empty = closetRow('closet-tags', {
      tag: { at: hoursAgo(1), state: 'empty', ok: true, note: null },
    })
    expect([empty.state, empty.summary]).toEqual(['ok', 'Nothing to tag'])
  })

  it("shows the plan run's note when it fell back to the template", () => {
    const note = "Gemini's daily quota is used up"
    const row = closetRow('closet-plans', {
      plan: { at: hoursAgo(1), state: 'template', ok: true, note },
    })
    expect([row.state, row.summary]).toEqual(['ok', note])
    expect(
      closetRow('closet-plans', {
        plan: { at: hoursAgo(1), state: 'template', ok: true, note: null },
      }).summary,
    ).toBe('Planned without the model')
  })

  it(`reads the outfit plans stale after ${STALE_HOURS} hours`, () => {
    const row = closetRow('closet-plans', {
      plan: { at: hoursAgo(STALE_HOURS + 1), state: 'ok', ok: true },
    })
    expect(row.state).toBe('stale')
  })

  it('reads the Sunday opinions stale only after a week and a day', () => {
    const at = (hours) =>
      closetRow('closet-opinions', {
        opinion: { at: hoursAgo(hours), state: 'ok', ok: true },
      }).state
    expect(at(6 * 24)).toBe('ok')
    expect(at(DISCOVER_STALE_HOURS + 1)).toBe('stale')
  })

  it("shows a skipped opinion run's note, and a failed one as failed", () => {
    const note = 'No model is configured'
    const skipped = closetRow('closet-opinions', {
      opinion: { at: hoursAgo(1), state: 'skipped', ok: true, note },
    })
    expect([skipped.state, skipped.summary]).toEqual(['ok', note])
    const empty = closetRow('closet-opinions', {
      opinion: { at: hoursAgo(1), state: 'empty', ok: true, note: null },
    })
    expect(empty.summary).toBe('Nothing flagged')
    const failed = closetRow('closet-opinions', {
      opinion: { at: hoursAgo(1), state: 'failed', ok: false, note: 'boom' },
    })
    expect([failed.state, failed.summary]).toEqual(['failed', 'Failed: boom'])
  })

  it('keeps a spent intake budget quiet, and a stopped run failed', () => {
    const waiting = intakeRow({ at: hoursAgo(1), state: 'waiting', ok: true })
    expect([waiting.state, waiting.summary]).toEqual([
      'ok',
      "Today's budget spent; photos wait",
    ])
    const empty = intakeRow({ at: hoursAgo(1), state: 'empty', ok: true })
    expect(empty.summary).toBe('Nothing to read')
    for (const state of ['stopped', 'failed']) {
      const row = intakeRow({ at: hoursAgo(1), state, ok: false, note: 'boom' })
      expect([row.state, row.summary]).toEqual(['failed', 'Failed: boom'])
    }
    expect(
      intakeRow({ at: hoursAgo(STALE_HOURS + 1), state: 'ok' }).state,
    ).toBe('stale')
  })

  it("links the intake row to Shelf's Add page, where reading is driven", () => {
    expect(intakeRow(null).runNow).toBe('/admin/collection/add')
  })

  it('reads the intake row unknown with no status', () => {
    const row = intakeRow(null)
    expect([row.state, row.summary]).toEqual(['unknown', 'No run recorded'])
  })

  it('reads the Closet rows unknown with no status', () => {
    const jobs = byKey(nightlyJobs(summary(), null, NOW, null, null))
    expect(jobs['closet-tags'].state).toBe('unknown')
    expect(jobs['closet-plans'].summary).toBe('No run recorded')
    expect(jobs['closet-opinions'].state).toBe('unknown')
  })

  it('says when the weekly jobs first run, before they have run', () => {
    const jobs = byKey(
      nightlyJobs(
        summary(),
        null,
        NOW,
        spots({ candidates: null }),
        closet({ opinion: null }),
      ),
    )
    for (const key of ['spots', 'closet-opinions']) {
      expect(jobs[key].summary).toBe('First run Sunday evening')
      expect(jobs[key].stateWords).toBe('scheduled')
      expect(jobs[key].scheduled).toBe(true)
      expect(jobs[key].state).toBe('unknown')
    }
    expect(jobs['closet-tags'].stateWords).toBeUndefined()
  })

  it('says nothing about a first run when the status could not be read', () => {
    const jobs = byKey(nightlyJobs(summary(), null, NOW, null, null))
    for (const key of ['spots', 'closet-opinions']) {
      expect(jobs[key].summary).toBe('No run recorded')
      expect(jobs[key].stateWords).toBeUndefined()
    }
  })

  it(`reads the forecast stale after ${STALE_HOURS} hours`, () => {
    const at = (hours) =>
      byKey(
        nightlyJobs(
          summary(),
          null,
          NOW,
          spots({ weather: { at: hoursAgo(hours), state: 'ok' } }),
        ),
      ).weather.state
    expect(at(STALE_HOURS - 1)).toBe('ok')
    expect(at(STALE_HOURS + 1)).toBe('stale')
  })

  it(`gives the spot finder ${DISCOVER_STALE_HOURS} hours, a week and a day`, () => {
    const at = (hours) =>
      byKey(
        nightlyJobs(
          summary(),
          null,
          NOW,
          spots({ candidates: { at: hoursAgo(hours), state: 'ok' } }),
        ),
      ).spots.state
    expect(at(STALE_HOURS + 1)).toBe('ok')
    expect(at(DISCOVER_STALE_HOURS + 1)).toBe('stale')
  })

  it('reads a failed Denver run as failed, with its note', () => {
    const jobs = byKey(
      nightlyJobs(
        summary(),
        null,
        NOW,
        spots({
          weather: { at: hoursAgo(1), state: 'failed', note: 'NWS timed out' },
          candidates: { at: hoursAgo(1), state: 'failed' },
        }),
      ),
    )
    expect(jobs.weather.state).toBe('failed')
    expect(jobs.weather.summary).toBe('Failed: NWS timed out')
    expect(jobs.spots.state).toBe('failed')
    expect(jobs.spots.summary).toBe('Failed')
  })

  it('words a run that found nothing, and keeps it ok', () => {
    const jobs = byKey(
      nightlyJobs(
        summary(),
        null,
        NOW,
        spots({
          weather: { at: hoursAgo(1), state: 'empty' },
          candidates: { at: hoursAgo(1), state: 'no_anchors' },
        }),
      ),
    )
    expect(jobs.weather.summary).toBe('NWS sent no hours')
    expect(jobs.weather.state).toBe('ok')
    expect(jobs.spots.summary).toBe('No anchors to search from')
    expect(jobs.spots.state).toBe('ok')
  })

  it('shows the note of an ok run, so a degraded finder run is visible', () => {
    const note = 'The model could not rank; template order kept'
    const jobs = byKey(
      nightlyJobs(
        summary(),
        null,
        NOW,
        spots({ candidates: { at: hoursAgo(1), state: 'ok', note } }),
      ),
    )
    expect(jobs.spots.summary).toBe(note)
    expect(jobs.spots.state).toBe('ok')
  })

  it('reads the Denver rows unknown with no status or no run', () => {
    for (const given of [undefined, null, spots({ weather: null })]) {
      const weather = byKey(nightlyJobs(summary(), null, NOW, given)).weather
      expect(weather.state).toBe('unknown')
      expect(weather.at).toBeNull()
      expect(weather.summary).toBe('No run recorded')
    }
  })

  it(`reads Radar stale after ${STALE_HOURS} hours`, () => {
    const at = (hours) =>
      byKey(nightlyJobs(summary({ radarAt: hoursAgo(hours) }), null, NOW)).radar
        .state
    expect(at(STALE_HOURS - 1)).toBe('ok')
    expect(at(STALE_HOURS + 1)).toBe('stale')
  })

  it(`gives Discover ${DISCOVER_STALE_HOURS} hours, a week and a day`, () => {
    const at = (hours) =>
      byKey(nightlyJobs(summary({ discoverAt: hoursAgo(hours) }), null, NOW))
        .discover.state
    expect(at(STALE_HOURS + 1)).toBe('ok')
    expect(at(DISCOVER_STALE_HOURS + 1)).toBe('stale')
  })

  it('names the failed sources on the catalog row', () => {
    const catalog = byKey(
      nightlyJobs(summary({ failed: ['Limited Run', 'Fangamer'] }), null, NOW),
    ).catalog
    expect(catalog.state).toBe('failed')
    expect(catalog.summary).toBe('Failed: Limited Run, Fangamer')
  })

  it('reads a stopped schedule as stale, with no catalog run', () => {
    const catalog = byKey(
      nightlyJobs(summary({ catalogueAt: null, stale: true }), null, NOW),
    ).catalog
    expect(catalog.state).toBe('stale')
    expect(catalog.stopped).toBe(true)
    expect(catalog.summary).toBe('Sources haven’t run yet')
  })

  it('reads a missing meta.json, or a missing generate, as unknown', () => {
    const jobs = byKey(
      nightlyJobs(
        summary({ radarAt: null, discoverAt: 'nonsense' }),
        null,
        NOW,
      ),
    )
    expect(jobs.snapshot.state).toBe('unknown')
    expect(jobs.snapshot.at).toBeNull()
    expect(jobs.radar.state).toBe('unknown')
    expect(jobs.discover.state).toBe('unknown')
  })

  it(`reads the snapshot stale after ${STALE_HOURS} hours`, () => {
    const at = (hours) =>
      byKey(nightlyJobs(summary(), hoursAgo(hours), NOW)).snapshot.state
    expect(at(STALE_HOURS - 1)).toBe('ok')
    expect(at(STALE_HOURS + 1)).toBe('stale')
  })
})

describe('every job says what it does and when it runs', () => {
  const rows = nightlyJobs(summary(), null, NOW)

  it('gives each of the thirteen jobs a purpose, a schedule and a next run', () => {
    expect(rows).toHaveLength(13)
    for (const row of rows) {
      expect(row.purpose, row.key).toMatch(/^[A-Z].*\.$/)
      expect(['nightly', 'sunday'], row.key).toContain(row.schedule)
      expect(row.next, row.key).toBeGreaterThan(NOW)
    }
  })

  it('has a JOB_INFO entry for no job that is not a row', () => {
    expect(Object.keys(JOB_INFO).sort()).toEqual(rows.map((r) => r.key).sort())
  })

  it('keeps the weekly jobs to Sunday evening', () => {
    expect(
      rows.filter((r) => r.schedule === 'sunday').map((r) => r.key),
    ).toEqual(['discover', 'spots', 'closet-opinions'])
  })
})

describe('nextRunAt', () => {
  it('is the next 00:17 UTC for a nightly job', () => {
    expect(nextRunAt('nightly', Date.parse('2026-11-23T10:00:00Z'))).toBe(
      Date.parse('2026-11-24T00:17:00Z'),
    )
    expect(nextRunAt('nightly', Date.parse('2026-11-23T00:10:00Z'))).toBe(
      Date.parse('2026-11-23T00:17:00Z'),
    )
  })

  it('never returns the moment it is asked at', () => {
    const at = Date.parse('2026-11-23T00:17:00Z')
    expect(nextRunAt('nightly', at)).toBe(Date.parse('2026-11-24T00:17:00Z'))
  })

  it('is the next Monday 00:17 UTC (Sunday evening in Denver) for a Sunday job', () => {
    // Monday 2026-11-23, after the start: the next one is a week on.
    expect(nextRunAt('sunday', Date.parse('2026-11-23T10:00:00Z'))).toBe(
      Date.parse('2026-11-30T00:17:00Z'),
    )
    expect(nextRunAt('sunday', Date.parse('2026-11-26T10:00:00Z'))).toBe(
      Date.parse('2026-11-30T00:17:00Z'),
    )
  })
})

describe('relativeWords', () => {
  const now = Date.parse('2026-11-23T12:00:00Z')
  it.each([
    [now - 20_000, 'just now'],
    [now - 5 * 60_000, '5 minutes ago'],
    [now - 3 * 3600_000, '3 hours ago'],
    [now + 8 * 3600_000, 'in 8 hours'],
    [now - 3 * 86400_000, '3 days ago'],
    [now + 6 * 86400_000, 'in 6 days'],
  ])('reads %s as %s', (ms, words) => {
    expect(relativeWords(ms, now)).toBe(words)
  })
})

describe('nightlyHeadline', () => {
  it('takes the worst known state and the newest time', () => {
    const jobs = nightlyJobs(
      summary({ radarAt: hoursAgo(STALE_HOURS + 2) }),
      null,
      NOW,
    )
    const headline = nightlyHeadline(jobs)
    expect(headline.state).toBe('stale')
    expect(headline.words).toMatch(/^nightly stale · \S+/)
  })

  it('lets a failure outrank staleness', () => {
    const jobs = nightlyJobs(
      summary({ failed: ['Limited Run'], radarAt: hoursAgo(STALE_HOURS + 2) }),
      null,
      NOW,
    )
    expect(nightlyHeadline(jobs).state).toBe('failed')
  })

  it('says unknown, with no time, when nothing is known', () => {
    const unknown = [{ state: 'unknown', at: null }]
    expect(nightlyHeadline(unknown)).toEqual({
      state: 'unknown',
      words: 'nightly unknown',
    })
  })
})
