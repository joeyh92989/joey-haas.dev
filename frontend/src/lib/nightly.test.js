import { describe, expect, it } from 'vitest'
import { lastNightly, nightlyWords, STALE_HOURS } from './nightly.js'

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

describe('nightlyWords', () => {
  it('says ok, failed or may have stopped', () => {
    const base = {
      catalogueAt: Date.parse('2026-10-05T00:40:00Z'),
      failed: [],
      stale: false,
      radarAt: null,
      discoverAt: null,
    }
    expect(nightlyWords(base)).toMatch(/^Last nightly: catalogue .+ · ok$/)
    expect(nightlyWords({ ...base, failed: ['Limited Run'] })).toMatch(
      /failed: Limited Run/,
    )
    expect(nightlyWords({ ...base, stale: true })).toMatch(
      /^Nightly may have stopped/,
    )
    expect(nightlyWords({ ...base, catalogueAt: null, stale: true })).toBe(
      'Nightly may have stopped: no catalogue run yet',
    )
  })

  it('adds the Radar and Discover times when given', () => {
    const words = nightlyWords({
      catalogueAt: Date.parse('2026-10-05T00:40:00Z'),
      failed: [],
      stale: false,
      radarAt: '2026-10-05T00:44:00Z',
      discoverAt: '2026-10-05T00:46:00Z',
    })
    expect(words).toMatch(/ · Radar .+ · Discover .+$/)
  })

  it('names an interrupted run even when no catalogue run finished', () => {
    expect(
      nightlyWords({
        catalogueAt: null,
        failed: ['Limited Run'],
        stale: true,
        radarAt: null,
        discoverAt: null,
      }),
    ).toBe(
      'Nightly may have stopped: no catalogue run finished · failed: Limited Run',
    )
  })
})
