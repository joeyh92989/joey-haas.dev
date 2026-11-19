import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import {
  NO_FILTERS,
  activeCount,
  applyFilters,
  filterOptions,
  filteredYearCounts,
  hasChoices,
  historyHrefForSpot,
  parseFilters,
  placeName,
  writeFilters,
} from './historyFilters.js'

const row = (id, more = {}) => ({
  id,
  spot_id: `s${id}`,
  spot_name: `Place ${id}`,
  city: 'denver',
  visited_on: '2026-06-13',
  verdict: 'fine',
  kid_along: false,
  tags: [],
  ...more,
})

const ROWS = [
  row(1, { verdict: 'loved', kid_along: true, tags: ['kid-ok', 'coffee'] }),
  row(2, { city: 'Boulder', tags: ['park'], kid_along: true }),
  row(3, { city: ' golden ', verdict: null }),
  row(4, { city: 'boulder', verdict: 'not_again', tags: ['coffee'] }),
  row(5, { verdict: 'loved', visited_on: '2025-12-31', spot_id: 's1' }),
]

const params = (query) => new URLSearchParams(query)

describe('parseFilters', () => {
  it('reads every filter from the params', () => {
    expect(
      parseFilters(
        params('city=boulder&tag=coffee&verdict=loved&kid=1&spot=s1'),
        ROWS,
      ),
    ).toEqual({
      city: 'boulder',
      tag: 'coffee',
      verdict: 'loved',
      kid: true,
      spot: 's1',
    })
  })

  it('is no filter at all for no params', () => {
    expect(parseFilters(params(''), ROWS)).toEqual(NO_FILTERS)
  })

  it('ignores a value that is not a choice, but keeps the others', () => {
    const got = parseFilters(
      params('city=paris&tag=nope&verdict=meh&kid=yes&spot=s2'),
      ROWS,
    )
    expect(got).toEqual({ ...NO_FILTERS, spot: 's2' })
    expect(parseFilters(params('city=boulder&tag=nope'), ROWS)).toEqual({
      ...NO_FILTERS,
      city: 'boulder',
    })
  })

  it('ignores a tag or verdict no outing has', () => {
    expect(parseFilters(params('tag=food&verdict=fine'), [ROWS[0]])).toEqual(
      NO_FILTERS,
    )
  })
})

describe('writeFilters', () => {
  it('writes only what is on and leaves other params alone', () => {
    const next = writeFilters(params('x=1&city=boulder&kid=1'), {
      ...NO_FILTERS,
      tag: 'park',
    })
    expect(next.toString()).toBe('x=1&tag=park')
    expect(
      writeFilters(params(''), {
        ...NO_FILTERS,
        kid: true,
        spot: 's1',
      }).toString(),
    ).toBe('kid=1&spot=s1')
  })
})

describe('applyFilters', () => {
  it('passes everything when nothing is on', () => {
    expect(applyFilters(ROWS, NO_FILTERS)).toEqual(ROWS)
  })

  it('ANDs the filters together', () => {
    const ids = (filters) =>
      applyFilters(ROWS, { ...NO_FILTERS, ...filters }).map((r) => r.id)
    expect(ids({ city: 'boulder' })).toEqual([2, 4])
    expect(ids({ city: 'boulder', tag: 'coffee' })).toEqual([4])
    expect(ids({ city: 'denver', verdict: 'loved', kid: true })).toEqual([1])
    expect(ids({ spot: 's1' })).toEqual([1, 5])
    expect(ids({ spot: 's1', verdict: 'fine' })).toEqual([])
  })

  it('keeps kid to outings the kid came along on, not unknown ones', () => {
    const rows = [row(1, { kid_along: null }), row(2, { kid_along: true })]
    expect(
      applyFilters(rows, { ...NO_FILTERS, kid: true }).map((r) => r.id),
    ).toEqual([2])
  })

  it('matches a spot id given as text to a numeric one', () => {
    expect(
      applyFilters([row(1, { spot_id: 7 })], { ...NO_FILTERS, spot: '7' }),
    ).toHaveLength(1)
  })
})

describe('filterOptions', () => {
  const options = filterOptions(ROWS)

  it('lists only the cities that occur, Denver first then A to Z, counted', () => {
    expect(options.cities).toEqual([
      { value: 'denver', label: 'Denver', count: 2 },
      { value: 'boulder', label: 'Boulder', count: 2 },
      { value: 'golden', label: 'Golden', count: 1 },
    ])
  })

  it('lists only the tags that occur, in vocabulary order', () => {
    expect(options.tags).toEqual([
      { value: 'coffee', count: 2 },
      { value: 'park', count: 1 },
      { value: 'kid-ok', count: 1 },
    ])
  })

  it('lists only the verdicts that occur, never a no-verdict choice', () => {
    expect(options.verdicts).toEqual([
      { value: 'loved', count: 2 },
      { value: 'fine', count: 1 },
      { value: 'not_again', count: 1 },
    ])
    expect(filterOptions([row(1, { verdict: null })]).verdicts).toEqual([])
  })

  it('counts the outings the kid came along on', () => {
    expect(options.kid).toBe(2)
  })

  it('is empty for no outings', () => {
    expect(filterOptions([])).toEqual({
      cities: [],
      tags: [],
      verdicts: [],
      kid: 0,
    })
  })
})

describe('filteredYearCounts', () => {
  const zone = process.env.TZ
  afterEach(() => {
    if (zone === undefined) delete process.env.TZ
    else process.env.TZ = zone
  })

  it('counts outings, distinct places and loved in the year only', () => {
    expect(filteredYearCounts(ROWS, 2026)).toEqual({
      outings: 4,
      places: 4,
      loved: 1,
    })
    expect(filteredYearCounts(ROWS, 2025)).toEqual({
      outings: 1,
      places: 1,
      loved: 1,
    })
  })

  it('counts a place once however many outings it has', () => {
    const rows = [row(1), row(2, { spot_id: 's1' })]
    expect(filteredYearCounts(rows, 2026).places).toBe(1)
  })

  it('reads the year off the stored date, whatever the zone', () => {
    process.env.TZ = 'Pacific/Honolulu'
    // A bare Date read puts New Year's Day in the year before here.
    expect(new Date('2026-01-01').getFullYear()).toBe(2025)
    const rows = [
      row(1, { visited_on: '2026-01-01', precision: 'year' }),
      row(2, { visited_on: '2025-12-31' }),
    ]
    expect(filteredYearCounts(rows, 2026).outings).toBe(1)
  })
})

describe('small helpers', () => {
  it('counts the filters that are on', () => {
    expect(activeCount(NO_FILTERS)).toBe(0)
    expect(activeCount({ ...NO_FILTERS, kid: true, city: 'denver' })).toBe(2)
  })

  it('names the place from its outings, or nothing', () => {
    expect(placeName(ROWS, 's2')).toBe('Place 2')
    expect(placeName(ROWS, 'zzz')).toBeNull()
  })
})

describe('place link and choices', () => {
  it('builds the History link for a spot and reads it back, any case', () => {
    const href = historyHrefForSpot('AB-12')
    expect(href).toBe('/admin/history?spot=AB-12')
    const query = new URLSearchParams(href.split('?')[1])
    expect(parseFilters(query, ROWS).spot).toBe('ab-12')
    expect(
      applyFilters([row(1, { spot_id: 'ab-12' })], {
        ...NO_FILTERS,
        spot: 'ab-12',
      }),
    ).toHaveLength(1)
  })

  it('has choices only when something would narrow the list', () => {
    expect(hasChoices(filterOptions(ROWS), ROWS.length)).toBe(true)
    const same = [row(1), row(2)]
    expect(hasChoices(filterOptions(same), same.length)).toBe(false)
    const lone = [row(1, { tags: ['park'] }), row(2)]
    expect(hasChoices(filterOptions(lone), lone.length)).toBe(true)
  })
})
