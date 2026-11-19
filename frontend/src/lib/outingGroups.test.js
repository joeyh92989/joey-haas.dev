import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'

import {
  groupOutings,
  headingOf,
  placeLine,
  whenWords,
} from './outingGroups.js'

const o = (visited_on, precision = 'day', more = {}) => ({
  id: visited_on + precision,
  spot_name: 'Place',
  neighbourhood: 'Highland',
  city: 'denver',
  title: null,
  visited_on,
  precision,
  ...more,
})

describe('groupOutings', () => {
  it('groups by month, keeping the order given', () => {
    const groups = groupOutings([
      o('2026-11-14'),
      o('2026-11-08'),
      o('2026-10-24'),
    ])
    expect(groups.map((g) => [g.label, g.rows.length])).toEqual([
      ['November 2026', 2],
      ['October 2026', 1],
    ])
  })

  it('puts a month outing with its month and a year outing in its own group after that year', () => {
    const groups = groupOutings([
      o('2025-06-05'),
      o('2025-06-01', 'month'),
      o('2025-01-01', 'year'),
      o('2024-12-30'),
    ])
    expect(groups.map((g) => g.label)).toEqual([
      'June 2025',
      '2025',
      'December 2024',
    ])
    expect(groups[0].rows).toHaveLength(2)
  })

  it('splits a year boundary', () => {
    const groups = groupOutings([o('2026-01-02'), o('2025-12-31')])
    expect(groups.map((g) => g.label)).toEqual([
      'January 2026',
      'December 2025',
    ])
  })

  it('returns nothing for nothing', () => {
    expect(groupOutings([])).toEqual([])
  })
})

describe('whenWords', () => {
  const zone = process.env.TZ
  afterEach(() => {
    if (zone === undefined) delete process.env.TZ
    else process.env.TZ = zone
  })

  // Catches a formatter that reads the stored day in the local zone. It
  // does not prove the zone in a real browser, only that this code does not
  // depend on the machine's zone.
  it('keeps the stored day in a zone far west of Greenwich', () => {
    process.env.TZ = 'Pacific/Honolulu'
    // The trap is real here: a bare local-time read shifts the day back.
    expect(new Date('2026-11-14').getDate()).toBe(13)
    expect(whenWords(o('2026-11-14')).text).toBe('Sat, Nov 14')
    expect(whenWords(o('2026-12-01', 'month')).text).toBe(
      'Some time in December 2026',
    )
    expect(groupOutings([o('2026-01-01')])[0].label).toBe('January 2026')
  })

  it('names a day with its weekday', () => {
    expect(whenWords(o('2026-11-14'))).toEqual({
      text: 'Sat, Nov 14',
      loose: false,
    })
  })
  it('says some time in a month or a year', () => {
    expect(whenWords(o('2026-09-01', 'month')).text).toBe(
      'Some time in September 2026',
    )
    expect(whenWords(o('2024-01-01', 'year')).text).toBe('Some time in 2024')
  })
})

describe('heading and place line', () => {
  it('heads with the title, and leads the place line with the name', () => {
    const t = o('2026-11-14', 'day', { title: 'Game' })
    expect(headingOf(t)).toBe('Game')
    expect(placeLine(t)).toBe('Place, Highland, Denver')
  })
  it('writes a multi-word city key as a label', () => {
    expect(placeLine(o('2026-11-14', 'day', { city: 'fort collins' }))).toBe(
      'Highland, Fort Collins',
    )
  })
  it('heads with the name when there is no title', () => {
    expect(headingOf(o('2026-11-14'))).toBe('Place')
    expect(placeLine(o('2026-11-14'))).toBe('Highland, Denver')
  })
})
