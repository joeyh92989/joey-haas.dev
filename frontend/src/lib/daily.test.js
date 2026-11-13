import { describe, expect, it } from 'vitest'
import {
  DAILY_EPOCH,
  MAX_GUESSES,
  PLATFORM_FAMILIES,
  RECENT_DAYS,
  addDays,
  dailyPool,
  dayKicker,
  dayNumber,
  fnv1a,
  grade,
  matchTitle,
  pickFor,
  picksThrough,
  shareText,
  shareWords,
  shortGenre,
  shortPlatform,
  suggest,
  yearOf,
  yesterdayPick,
} from './daily.js'

// The ten strings PLATFORM_NAMES (backend/sources/igdb.py) and
// ItemForm.PLATFORM_OPTIONS agree on.
const PLATFORM_NAMES = [
  'Nintendo 64',
  'Nintendo Switch',
  'Nintendo Switch 2',
  'Nintendo 3DS',
  'Wii U',
  'PlayStation 5',
  'PlayStation 4',
  'Xbox Series X|S',
  'Xbox One',
  'PC',
]

function game(id, overrides = {}) {
  return {
    id,
    type: 'game',
    title: `Game ${id}`,
    wanted: false,
    platform: 'Nintendo Switch',
    year: 2023,
    release_date: '2023-03-30',
    genres: ['Role-playing (RPG)', 'Adventure'],
    time_to_beat_hours: 12,
    ...overrides,
  }
}

const ANSWER = game('a', {
  title: 'Sea of Stars',
  platform: 'Nintendo Switch',
  year: 2023,
  genres: ['Role-playing (RPG)', 'Adventure', 'Indie'],
  time_to_beat_hours: 12,
})

describe('dailyPool', () => {
  it('keeps public owned games every column can grade, sorted by id', () => {
    const items = [
      game('c'),
      game('a'),
      game('b', { release_date: '2019-05-01', year: null }),
    ]
    expect(dailyPool(items).map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it.each([
    ['a movie', { type: 'movie' }],
    ['a comic', { type: 'comic' }],
    ['a Want', { wanted: true }],
    ['no platform', { platform: null }],
    ['an empty platform', { platform: '' }],
    ['no year', { year: null, release_date: null }],
    ['no genres', { genres: [] }],
    ['genres missing', { genres: undefined }],
    ['no time to beat', { time_to_beat_hours: null }],
  ])('drops %s', (_, overrides) => {
    expect(dailyPool([game('x', overrides)])).toEqual([])
  })

  it('reads the year from the release date when year is missing', () => {
    expect(yearOf({ year: null, release_date: '2019-05-01' })).toBe(2019)
    expect(yearOf({ year: 2021, release_date: null })).toBe(2021)
    expect(yearOf({ year: null, release_date: null })).toBeNull()
  })
})

describe('dayNumber', () => {
  it('is 1 on the epoch and counts calendar days', () => {
    expect(dayNumber(DAILY_EPOCH)).toBe(1)
    expect(dayNumber(addDays(DAILY_EPOCH, 1))).toBe(2)
    expect(dayNumber(addDays(DAILY_EPOCH, -1))).toBe(0)
  })

  it('does not drift across daylight-saving changes', () => {
    // Denver springs forward on 8 March 2026 and falls back on 1 November.
    expect(dayNumber('2026-03-09', '2026-03-07')).toBe(3)
    expect(dayNumber('2026-11-02', '2026-10-31')).toBe(3)
    expect(dayNumber('2027-01-01', '2026-01-01')).toBe(366)
  })

  it('adds days on the calendar', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('fnv1a', () => {
  it('matches the published 32-bit vectors', () => {
    expect(fnv1a('')).toBe(0x811c9dc5)
    expect(fnv1a('a')).toBe(0xe40c292c)
    expect(fnv1a('foobar')).toBe(0xbf9cf968)
  })
})

describe('picks', () => {
  const pool = dailyPool(Array.from({ length: 10 }, (_, n) => game(`g${n}`)))
  const sixtyDays = Array.from({ length: 60 }, (_, n) =>
    addDays(DAILY_EPOCH, n),
  )

  it('is the same for the same salt and day, and changes with the salt', () => {
    const day = sixtyDays[20]
    expect(pickFor(day, pool, 'salt').item).toBe(
      pickFor(day, pool, 'salt').item,
    )
    const other = sixtyDays.filter(
      (d) => pickFor(d, pool, 'salt').item !== pickFor(d, pool, 'other').item,
    )
    expect(other.length).toBeGreaterThan(30)
  })

  it('never repeats any of the previous seven days and stays in the pool', () => {
    const picks = picksThrough(sixtyDays.at(-1), pool, 'salt')
    expect(picks).toHaveLength(60)
    picks.forEach((pick, index) => {
      expect(pick.day).toBe(index + 1)
      expect(pick.isoDay).toBe(sixtyDays[index])
      expect(pool).toContain(pick.item)
      const recent = picks.slice(Math.max(0, index - RECENT_DAYS), index)
      expect(recent.map((r) => r.item.id)).not.toContain(pick.item.id)
    })
  })

  it('alternates a two-game pool, stepping past the recent pick', () => {
    const two = dailyPool([game('a'), game('b')])
    const picks = picksThrough(sixtyDays[9], two, 'salt')
    picks.slice(1).forEach((pick, index) => {
      expect(pick.item.id).not.toBe(picks[index].item.id)
    })
  })

  it('keeps the answers when the pool gains a game', () => {
    // The nightly snapshot can grow the pool mid-day: today's answer must
    // not move unless the new game is the answer itself.
    const big = dailyPool(Array.from({ length: 40 }, (_, n) => game(`g${n}`)))
    const grown = dailyPool([...big, game('new')])
    const before = picksThrough(sixtyDays.at(-1), big, 'salt')
    const after = picksThrough(sixtyDays.at(-1), grown, 'salt')
    const moved = after.filter(
      (pick, index) =>
        pick.item.id !== 'new' && pick.item.id !== before[index].item.id,
    )
    // Only a day the new game wins, and the week its absence from the
    // window touches, can move: a handful of sixty, not all of them.
    expect(moved.length).toBeLessThanOrEqual(3)
    expect(after.at(-1).item.id).toBe(before.at(-1).item.id)
  })

  it('does not loop on a pool that is all recent', () => {
    const one = dailyPool([game('only')])
    expect(picksThrough(sixtyDays[9], one, 'salt')).toHaveLength(10)
  })

  it('has no pick before the epoch or with an empty pool', () => {
    expect(pickFor(addDays(DAILY_EPOCH, -1), pool, 'salt')).toBeNull()
    expect(pickFor(DAILY_EPOCH, [], 'salt')).toBeNull()
  })

  it("knows yesterday's pick, except on day 1", () => {
    expect(yesterdayPick(DAILY_EPOCH, pool, 'salt')).toBeNull()
    const today = pickFor(sixtyDays[5], pool, 'salt')
    const yesterday = yesterdayPick(sixtyDays[5], pool, 'salt')
    expect(yesterday.day).toBe(5)
    expect(yesterday.item).not.toBe(today.item)
    expect(yesterday.item).toBe(pickFor(sixtyDays[4], pool, 'salt').item)
  })
})

describe('grade', () => {
  it('matches every column on the answer itself', () => {
    const cells = grade(ANSWER, ANSWER)
    expect(cells.platform).toEqual({ state: 'match', value: 'Switch' })
    expect(cells.year).toEqual({ state: 'match', value: '2023' })
    expect(cells.genre).toEqual({ state: 'match', value: 'RPG' })
    expect(cells.size).toEqual({ state: 'match', value: 'Medium' })
  })

  describe('platform', () => {
    it.each([
      ['Nintendo Switch', 'match'],
      ['Nintendo Switch 2', 'close'],
      ['PlayStation 5', 'no'],
    ])('%s against Switch is %s', (platform, state) => {
      expect(grade(game('g', { platform }), ANSWER).platform.state).toBe(state)
    })

    it('knows the PlayStation and Xbox families', () => {
      const ps5 = game('a', { platform: 'PlayStation 5' })
      expect(
        grade(game('g', { platform: 'PlayStation 4' }), ps5).platform.state,
      ).toBe('close')
      const series = game('a', { platform: 'Xbox Series X|S' })
      expect(
        grade(game('g', { platform: 'Xbox One' }), series).platform.state,
      ).toBe('close')
      expect(
        grade(game('g', { platform: 'Xbox One' }), ps5).platform.state,
      ).toBe('no')
    })

    it('names only platforms the server can resolve', () => {
      PLATFORM_FAMILIES.flat().forEach((name) => {
        expect(PLATFORM_NAMES).toContain(name)
      })
    })

    it('shows the family name without the maker', () => {
      expect(shortPlatform('Nintendo Switch 2')).toBe('Switch 2')
      expect(shortPlatform('PlayStation 5')).toBe('PS5')
      expect(shortPlatform('PC')).toBe('PC')
    })
  })

  describe('year', () => {
    it.each([
      [2023, 'match', undefined, undefined],
      [2022, 'close', '↑', 'later'],
      [2021, 'close', '↑', 'later'],
      [2020, 'no', '↑', 'later'],
      [2024, 'close', '↓', 'earlier'],
      [2025, 'close', '↓', 'earlier'],
      [2026, 'no', '↓', 'earlier'],
    ])('%i against 2023 is %s %s %s', (year, state, arrow, word) => {
      const cell = grade(game('g', { year, release_date: null }), ANSWER).year
      expect(cell.state).toBe(state)
      expect(cell.arrow).toBe(arrow)
      expect(cell.word).toBe(word)
      expect(cell.value).toBe(String(year))
    })
  })

  describe('genre', () => {
    it.each([
      [
        'the same set in another order',
        ['Indie', 'Adventure', 'Role-playing (RPG)'],
        'match',
      ],
      [
        'the same lead genre, other tail',
        ['Role-playing (RPG)', 'Strategy'],
        'match',
      ],
      ['one genre in common', ['Adventure', 'Puzzle'], 'close'],
      ['none in common', ['Shooter', 'Arcade'], 'no'],
    ])('%s is %s', (_, genres, state) => {
      expect(grade(game('g', { genres }), ANSWER).genre.state).toBe(state)
    })

    it('shows the lead genre, shortened', () => {
      expect(
        grade(game('g', { genres: ["Hack and slash/Beat 'em up"] }), ANSWER)
          .genre.value,
      ).toBe('Hack & slash')
      expect(shortGenre('Turn-based strategy (TBS)')).toBe('TBS')
      expect(shortGenre('Puzzle')).toBe('Puzzle')
    })
  })

  describe('size', () => {
    it.each([
      [12, 'match', undefined, undefined, 'Medium'],
      [3, 'close', '↑', 'longer', 'Short'],
      [40, 'close', '↓', 'shorter', 'Long'],
    ])(
      '%s h against Medium is %s %s %s',
      (hours, state, arrow, word, value) => {
        const cell = grade(
          game('g', { time_to_beat_hours: hours }),
          ANSWER,
        ).size
        expect(cell).toEqual(
          arrow ? { state, value, arrow, word } : { state, value },
        )
      },
    )

    it('is no with an arrow two bands apart', () => {
      const long = game('a', { time_to_beat_hours: 40 })
      expect(grade(game('g', { time_to_beat_hours: 3 }), long).size).toEqual({
        state: 'no',
        value: 'Short',
        arrow: '↑',
        word: 'longer',
      })
      const short = game('a', { time_to_beat_hours: 3 })
      expect(grade(game('g', { time_to_beat_hours: 40 }), short).size).toEqual({
        state: 'no',
        value: 'Long',
        arrow: '↓',
        word: 'shorter',
      })
    })

    it('shows — for a guess with no time to beat', () => {
      expect(
        grade(game('g', { time_to_beat_hours: null }), ANSWER).size,
      ).toEqual({
        state: 'no',
        value: '—',
      })
    })
  })
})

describe('suggest', () => {
  const pool = dailyPool([
    game('1', { title: 'Sea of Stars' }),
    game('2', { title: 'Dredge' }),
    game('3', { title: 'Seasons After Fall' }),
    game('4', { title: 'Chased by the Sea' }),
    game('5', { title: 'Pokémon Legends: Arceus' }),
    game('6', { title: 'Sealed Bite' }),
    game('7', { title: 'Search Party' }),
    game('8', { title: 'Seafarer' }),
  ])

  it('lists prefix matches first, then substring matches, alphabetically', () => {
    expect(suggest('sea', pool).map((item) => item.title)).toEqual([
      'Sea of Stars',
      'Seafarer',
      'Sealed Bite',
      'Search Party',
      'Seasons After Fall',
      'Chased by the Sea',
    ])
  })

  it('caps at six, drops guessed titles and ignores case and accents', () => {
    expect(suggest('SEA', pool)).toHaveLength(6)
    expect(
      suggest('sea', pool, ['1', '8']).map((item) => item.id),
    ).not.toContain('1')
    expect(suggest('pokemon', pool).map((item) => item.id)).toEqual(['5'])
    expect(suggest('   ', pool)).toEqual([])
  })

  it('finds an exact title for Enter without a highlight', () => {
    expect(matchTitle('dredge', pool).id).toBe('2')
    expect(matchTitle('pokémon legends: arceus', pool).id).toBe('5')
    expect(matchTitle('dred', pool)).toBeNull()
  })
})

describe('share', () => {
  const rows = [
    grade(
      game('g1', {
        platform: 'PlayStation 5',
        year: 2022,
        genres: ['Adventure', 'Puzzle'],
        time_to_beat_hours: 40,
      }),
      ANSWER,
    ),
    grade(
      game('g2', {
        year: 2023,
        genres: ['Role-playing (RPG)'],
        time_to_beat_hours: 3,
      }),
      ANSWER,
    ),
    grade(ANSWER, ANSWER),
  ]

  it('writes the exact block for a win', () => {
    expect(shareText(37, rows, true)).toBe(
      [
        'Daily game 37 · 3/6',
        '⬛🟨🟨🟨',
        '🟩🟩🟩🟨',
        '🟩🟩🟩🟩',
        'joey-haas.dev/daily',
      ].join('\n'),
    )
  })

  it('writes X for a loss', () => {
    const six = Array.from({ length: MAX_GUESSES }, () => rows[0])
    const text = shareText(38, six, false)
    expect(text.split('\n')[0]).toBe('Daily game 38 · X/6')
    expect(text.split('\n')).toHaveLength(MAX_GUESSES + 2)
  })

  it('describes every row in words', () => {
    expect(shareWords(rows)).toEqual([
      'Row 1: platform no, year close (later), genre close, size close (shorter)',
      'Row 2: platform match, year match, genre match, size close (longer)',
      'Row 3: platform match, year match, genre match, size match',
    ])
  })

  it('formats the kicker', () => {
    expect(dayKicker(37, '2026-11-08')).toBe('Day 37 · 8 Nov')
  })
})
