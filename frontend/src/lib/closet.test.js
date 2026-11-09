import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FILTER,
  backMonth,
  chipCounts,
  countsLine,
  filterGarments,
  garmentTitle,
  MAX_PHOTO_BYTES,
  oversizePhoto,
  profileBody,
  profileForm,
  seasonLabel,
  splitWords,
  statLine,
  tagResult,
} from './closet.js'

const garment = (fields) => ({
  id: 'g',
  name: 'Navy oxford',
  status: 'active',
  category: 'top',
  seasons: [],
  wears_12mo: 0,
  tag_source: 'model',
  tag_attempts: 0,
  back_on: null,
  warmth: null,
  formality: null,
  ...fields,
})

describe('seasonLabel', () => {
  it.each([
    [[], null],
    [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'all year'],
    [[5, 6, 7, 8, 9], 'May–Sep'],
    [[10, 11, 12, 1, 2, 3], 'Oct–Mar'],
    [[7], 'Jul'],
    [[1, 2, 6, 7], 'Jan–Feb, Jun–Jul'],
    [[12, 1, 5], 'May, Dec–Jan'],
  ])('labels %j as %s', (seasons, label) => {
    expect(seasonLabel(seasons)).toBe(label)
  })
})

describe('statLine', () => {
  it('reads wears and the season window for an active piece', () => {
    expect(
      statLine(garment({ wears_12mo: 14, seasons: [10, 11, 12, 1] })),
    ).toBe('Worn 14× · Oct–Jan')
    expect(statLine(garment({ wears_12mo: 3, seasons: [] }))).toBe('Worn 3×')
  })

  it('names the return month of a packed piece', () => {
    expect(statLine(garment({ status: 'packed', back_on: '2027-05-01' }))).toBe(
      'Packed · back in May',
    )
    expect(statLine(garment({ status: 'packed' }))).toBe('Packed')
  })

  it('tells the queue from a given-up or hand-made untagged piece', () => {
    expect(statLine(garment({ status: 'untagged', tag_source: null }))).toBe(
      'In the tag queue',
    )
    expect(
      statLine(
        garment({ status: 'untagged', tag_source: null, tag_attempts: 3 }),
      ),
    ).toBe('Tagging gave up · add by hand')
    expect(
      statLine(garment({ status: 'untagged', tag_source: 'manual' })),
    ).toBe('Add details by hand')
  })
})

it('titles an unnamed upload as untagged', () => {
  expect(garmentTitle(garment({ name: null, status: 'untagged' }))).toBe(
    'Untagged · add details',
  )
})

it('reads the month from back_on', () => {
  expect(backMonth('2027-11-01')).toBe('Nov')
  expect(backMonth(null)).toBeNull()
})

describe('filterGarments', () => {
  const closet = [
    garment({ id: 'a', category: 'top', warmth: 2, formality: 4 }),
    garment({ id: 'b', category: 'outer', warmth: 5, formality: 2 }),
    garment({ id: 'c', status: 'packed', category: 'bottom' }),
    garment({ id: 'd', status: 'untagged', category: null }),
  ]
  const ids = (filter) => filterGarments(closet, filter).map((g) => g.id)

  it('keeps active by default', () => {
    expect(ids(DEFAULT_FILTER)).toEqual(['a', 'b'])
  })

  it('ANDs the category and the attribute toggles', () => {
    expect(ids({ ...DEFAULT_FILTER, warm: true })).toEqual(['b'])
    expect(ids({ ...DEFAULT_FILTER, smart: true })).toEqual(['a'])
    expect(ids({ ...DEFAULT_FILTER, category: 'outer', smart: true })).toEqual(
      [],
    )
  })

  it('shows everything once the status chip is cleared', () => {
    expect(ids({ ...DEFAULT_FILTER, status: null })).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
  })

  it('counts each chip over the whole closet', () => {
    const counts = chipCounts(closet)
    expect(counts.status).toMatchObject({ active: 2, packed: 1, untagged: 1 })
    expect(counts.category.outer).toBe(1)
    expect(counts.warm).toBe(1)
    expect(counts.smart).toBe(1)
  })
})

it('words the header counts, leaving out the empty ones', () => {
  expect(countsLine({ total: 143, active: 86, packed: 41, untagged: 16 })).toBe(
    '143 pieces · 86 active · 41 packed · 16 untagged',
  )
  expect(countsLine({ total: 1, active: 1, packed: 0, untagged: 0 })).toBe(
    '1 piece · 1 active',
  )
})

describe('tagResult', () => {
  it('words a run, an empty queue and the route note', () => {
    expect(tagResult({ tagged: 2, calls: 1, note: null, remaining: 3 })).toBe(
      '2 tagged, 3 still queued',
    )
    expect(tagResult({ tagged: 4, calls: 1, note: null, remaining: 0 })).toBe(
      '4 tagged, queue empty',
    )
    expect(tagResult({ tagged: 0, calls: 0, note: null, remaining: 0 })).toBe(
      'nothing was waiting to be tagged',
    )
    expect(
      tagResult({
        tagged: 0,
        calls: 1,
        note: 'Gemini is used up',
        remaining: 5,
      }),
    ).toBe('Gemini is used up')
  })
})

describe('profile form', () => {
  const body = {
    sizes: { top: 'M', shoes: '10' },
    coloring: { hair: 'brown' },
    build_fit: null,
    style_words: ['minimal', 'navy'],
    dislikes: [],
    weekly_occasions: [
      'office',
      'office',
      'wfh',
      'office',
      'wfh',
      'weekend',
      'weekend',
    ],
    weekly_bike: [true, false, false, true, false, false, false],
    spring_turn: '04-25',
    autumn_turn: '10-01',
    repeat_top_days: 7,
    repeat_outfit_weeks: 3,
    tag_budget: 12,
    occasions: ['office', 'wfh', 'date', 'weekend', 'travel', 'event'],
  }

  it('round-trips through the form unchanged', () => {
    const form = profileForm(body)
    expect(form.sizes).toEqual({
      outer: '',
      mid: '',
      top: 'M',
      bottom: '',
      shoes: '10',
      accessory: '',
    })
    expect(form.style_words).toBe('minimal, navy')
    expect(form.tag_budget).toBe('12')
    const back = profileBody(form)
    expect(back.style_words).toEqual(['minimal', 'navy'])
    expect(back.dislikes).toEqual([])
    expect(back.build_fit).toBeNull()
    expect(back.repeat_top_days).toBe(7)
    expect(back.tag_budget).toBe(12)
    expect(back.weekly_bike).toEqual(body.weekly_bike)
  })

  it('sends a blank number as null, never 0', () => {
    const form = profileForm(body)
    const back = profileBody({
      ...form,
      repeat_top_days: '',
      repeat_outfit_weeks: '  ',
      tag_budget: '0',
    })
    expect(back.repeat_top_days).toBeNull()
    expect(back.repeat_outfit_weeks).toBeNull()
    expect(back.tag_budget).toBe(0)
  })

  it('splits a word line and drops blanks', () => {
    expect(splitWords(' logos, , skinny fits ,')).toEqual([
      'logos',
      'skinny fits',
    ])
  })
})

describe('oversizePhoto', () => {
  it('names the first photo over the cap, and nothing at the cap', () => {
    const at = { name: 'a.jpg', size: MAX_PHOTO_BYTES }
    const over = { name: 'b.heic', size: MAX_PHOTO_BYTES + 1 }
    expect(oversizePhoto([at])).toBeNull()
    expect(oversizePhoto([at, over])).toBe(
      'b.heic is too large: at most 14 MB a photo.',
    )
  })
})
