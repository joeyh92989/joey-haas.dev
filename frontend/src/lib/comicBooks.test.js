import { describe, expect, it } from 'vitest'
import {
  hashRanges,
  markWords,
  needsNumber,
  parseNumber,
  repeats,
  seriesAdds,
} from './comicBooks.js'

const chosen = {
  external_source: 'comicvine',
  external_id: '1',
  title: 'Waterworld',
}

const book = (id, number, extra = {}) => ({
  id,
  kind: 'comic',
  state: 'exact',
  chosen,
  payload: {
    detected_title: 'Waterworld',
    issue_number: number,
    number_source: number == null ? 'none' : 'read',
    format: 'single',
  },
  number_check: { state: number == null ? 'none' : 'in_run', run: 4 },
  on_shelf: null,
  ...extra,
})

describe('parseNumber', () => {
  it.each([
    ['4', 4],
    [' #4 ', 4],
    ['', null],
    ['  ', null],
    ['9999', 9999],
    ['0', undefined],
    ['10000', undefined],
    ['½', undefined],
    ['1.5', undefined],
    ['Annual 1', undefined],
    ['-2', undefined],
  ])('%j is %j', (text, expected) => {
    expect(parseNumber(text)).toBe(expected)
  })
})

describe('needsNumber', () => {
  it('holds a ticked single book with no number', () => {
    expect(needsNumber(book('a', null))).toBe(true)
    expect(needsNumber(book('a', 2))).toBe(false)
  })

  it('does not hold an unticked, removed or collected book', () => {
    expect(needsNumber(book('a', null, { state: 'ignored' }))).toBe(false)
    const collected = book('a', null)
    collected.payload.format = 'collected'
    expect(needsNumber(collected)).toBe(false)
  })

  it('accepts a range typed in the add bar', () => {
    const typed = book('a', null)
    typed.payload.issues_owned = '58–59'
    expect(needsNumber(typed)).toBe(false)
  })

  it('leaves other kinds alone', () => {
    expect(needsNumber({ ...book('a', null), kind: 'game' })).toBe(false)
  })
})

describe('markWords', () => {
  it.each([
    ['in_run', 'Read from the cover. In the run.'],
    ['out_of_run', 'Read from the cover. Not in this series’ run.'],
    ['typed', 'Typed.'],
    ['none', 'Couldn’t read the number. Type it.'],
    ['read', 'Read from the cover.'],
  ])('%s', (state, words) => {
    expect(markWords({ ...book('a', 1), number_check: { state } })).toBe(words)
  })

  it('says nothing for a collected edition', () => {
    const collected = book('a', null)
    collected.payload.format = 'collected'
    expect(markWords(collected)).toBeNull()
  })
})

describe('repeats', () => {
  it('flags the second book of the same series and number', () => {
    const list = [book('a', 2), book('b', 3), book('c', 2)]
    expect([...repeats(list)]).toEqual(['c'])
  })

  it('does not flag different series or unticked books', () => {
    const other = book('c', 2, {
      chosen: { ...chosen, external_id: '9' },
    })
    expect(repeats([book('a', 2), other]).size).toBe(0)
    expect(
      repeats([book('a', 2), book('b', 2, { state: 'ignored' })]).size,
    ).toBe(0)
  })
})

describe('seriesAdds', () => {
  it('sums four Waterworld books into #1–4', () => {
    const [series] = seriesAdds([1, 2, 3, 4].map((n) => book(`b${n}`, n)))
    expect(series.added).toEqual([1, 2, 3, 4])
    expect(hashRanges(series.added)).toBe('#1–4')
    expect(series.missing).toBe(0)
  })

  it('splits what the shelf holds already from what is new', () => {
    const on_shelf = { owned_text: '1–4' }
    const [series] = seriesAdds([
      book('a', 4, { on_shelf }),
      book('b', 5, { on_shelf }),
    ])
    expect(series.added).toEqual([5])
    expect(series.already).toEqual([4])
  })

  it('counts a book without a number and lists a collected edition', () => {
    const omnibus = book('c', null)
    omnibus.payload = {
      ...omnibus.payload,
      format: 'collected',
      edition_kind: 'omnibus',
      collects_from: 1,
      collects_to: 6,
    }
    const [series] = seriesAdds([book('a', null), omnibus])
    expect(series.missing).toBe(1)
    expect(series.editions).toEqual([
      { kind: 'Omnibus', label: 'Waterworld', from: 1, to: 6 },
    ])
  })

  it('skips unticked books', () => {
    expect(seriesAdds([book('a', 1, { state: 'ignored' })])).toEqual([])
  })
})

describe('hashRanges', () => {
  it('writes each range after one hash', () => {
    expect(hashRanges([1, 2, 3, 6])).toBe('#1–3, #6')
  })
})
