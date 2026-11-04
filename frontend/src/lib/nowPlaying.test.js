import { describe, expect, it } from 'vitest'
import { NOW_PLAYING_LIMIT, currentRunStart, nowPlaying } from './nowPlaying.js'

const game = (title, fields = {}) => ({
  id: title,
  type: 'game',
  title,
  status: 'active',
  ...fields,
})

describe('currentRunStart', () => {
  it('reads the public playing_since first', () => {
    expect(
      currentRunStart(
        game('A', { playing_since: '2026-11-01', started_at: '2024-01-01' }),
      ),
    ).toBe('2026-11-01')
  })

  it('reads the open playthrough on an admin row, not the earliest start', () => {
    const replay = game('A', {
      started_at: '2024-01-01',
      playthroughs: [
        { number: 1, started_on: '2024-01-01', outcome: 'finished' },
        { number: 2, started_on: '2026-10-20', outcome: null },
      ],
    })
    expect(currentRunStart(replay)).toBe('2026-10-20')
  })

  it('never shows the earliest start for an undated open run', () => {
    const replay = game('A', {
      started_at: '2024-01-01',
      playthroughs: [
        { number: 1, started_on: '2024-01-01', outcome: 'finished' },
        { number: 2, started_on: null, outcome: null },
      ],
    })
    expect(currentRunStart(replay)).toBeNull()
  })

  it('falls back to started_at only without runs, then null', () => {
    expect(currentRunStart(game('A', { started_at: '2026-09-01' }))).toBe(
      '2026-09-01',
    )
    expect(currentRunStart(game('A'))).toBeNull()
  })
})

describe('nowPlaying', () => {
  it('keeps only active, owned games', () => {
    const rows = nowPlaying([
      game('Playing'),
      game('Paused', { status: 'paused' }),
      game('Wanted', { wanted: true }),
      game('Admin want', { owned_format: 'none' }),
      game('Reading', { type: 'comic' }),
    ])
    expect(rows.map((row) => row.item.title)).toEqual(['Playing'])
  })

  it('puts the newest start first, undated last, then by title', () => {
    const rows = nowPlaying([
      game('Undated'),
      game('Older', { playing_since: '2026-10-01' }),
      game('B newer', { playing_since: '2026-11-02' }),
      game('A newer', { playing_since: '2026-11-02' }),
    ])
    expect(rows.map((row) => row.item.title)).toEqual([
      'A newer',
      'B newer',
      'Older',
    ])
    expect(rows[0].since).toBe('2026-11-02')
  })

  it(`shows at most ${NOW_PLAYING_LIMIT}`, () => {
    const many = ['A', 'B', 'C', 'D'].map((title) => game(title))
    expect(nowPlaying(many)).toHaveLength(NOW_PLAYING_LIMIT)
  })
})
