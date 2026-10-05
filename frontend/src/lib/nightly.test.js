import { describe, expect, it } from 'vitest'
import { lastNightly, nightlyWords, STALE_HOURS } from './nightly.js'

const NOW = Date.parse('2026-10-05T12:00:00Z')
const run = (source, kind, finished_at, ok = true, name = source) => ({
  source,
  name,
  kind,
  last_run: finished_at ? { finished_at, ok } : null,
})

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
})
