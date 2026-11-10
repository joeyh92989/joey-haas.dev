import { describe, expect, it } from 'vitest'
import {
  DISCOVER_STALE_HOURS,
  lastNightly,
  nightlyHeadline,
  nightlyJobs,
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
  ...overrides,
})
const closetRow = (key, run) =>
  byKey(nightlyJobs(summary(), null, NOW, null, closet(run)))[key]
const byKey = (jobs) => Object.fromEntries(jobs.map((job) => [job.key, job]))

describe('nightlyJobs', () => {
  it('lists the eight jobs, all ok', () => {
    const jobs = nightlyJobs(summary(), hoursAgo(1), NOW, spots(), closet())
    expect(jobs.map((job) => job.key)).toEqual([
      'catalog',
      'radar',
      'discover',
      'weather',
      'spots',
      'closet-tags',
      'closet-plans',
      'snapshot',
    ])
    expect(jobs.every((job) => job.state === 'ok')).toBe(true)
    expect(jobs.map((job) => job.runNow)).toEqual([
      '/admin/catalogue',
      '/admin/radar',
      '/admin/discover',
      '/admin/weekend',
      '/admin/spots',
      '/admin/closet',
      '/admin/closet/today',
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

  it('reads the Closet rows unknown with no status', () => {
    const jobs = byKey(nightlyJobs(summary(), null, NOW, null, null))
    expect(jobs['closet-tags'].state).toBe('unknown')
    expect(jobs['closet-plans'].summary).toBe('No run recorded')
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
    expect(catalog.summary).toBe('No catalog run yet')
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
