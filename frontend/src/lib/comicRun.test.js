import { describe, expect, it } from 'vitest'
import {
  boxTiles,
  cardLines,
  countText,
  displayRanges,
  laneSpans,
  laneSpansFromRow,
  lanesLabel,
  nearCells,
  runModel,
  runSentence,
  seriesGrowth,
} from './comicRun.js'

const SPAWN = {
  singles: '1–100, 150, 200, 220–225, 300–312',
  readTo: 100,
  released: 362,
  ongoing: true,
}

const SAGA_EDITIONS = Array.from({ length: 9 }, (_, i) => ({
  kind: 'Trade',
  label: `Vol. ${i + 1}`,
  from: i * 6 + 1,
  to: i * 6 + 6,
}))

const date = (iso) => `on ${iso}`

describe('runModel', () => {
  it('reads a four-issue run issue by issue', () => {
    const model = runModel({ singles: '1–4', released: 4 })
    expect(model.issues.map((issue) => issue.k)).toEqual([
      'owned',
      'owned',
      'owned',
      'owned',
    ])
    expect(model).toMatchObject({
      held: 4,
      missing: 0,
      read: 0,
      state: 'complete',
    })
    expect(model.readNext.n).toBe(1)
  })

  it('counts an issue held in an edition and as a single once', () => {
    const model = runModel({
      singles: '5–8',
      editions: [{ kind: 'Trade', label: 'Vol. 1', from: 1, to: 6 }],
      released: 8,
    })
    expect(model.held).toBe(8)
    expect(model.twice).toBe(2)
    const tiles = boxTiles(model)
    expect(tiles.map((tile) => tile.type)).toEqual(['book', 'cell', 'cell'])
    expect(tiles[1].n).toBe(7)
  })

  it('takes the public editions shape', () => {
    const model = runModel({
      singles: '1–6',
      editions: [
        { kind: 'Trade', label: 'Vol. 1', from_issue: 1, to_issue: 6 },
      ],
      released: 6,
    })
    expect(model.issues[0].edition.label).toBe('Vol. 1')
  })

  it('marks read, missing and the first gap and next to read', () => {
    const model = runModel({
      singles: '1–3, 5–6',
      readTo: 2,
      released: 7,
      ongoing: true,
    })
    expect(model.issues.map((issue) => issue.k)).toEqual([
      'read',
      'read',
      'owned',
      'missing',
      'owned',
      'owned',
      'missing',
    ])
    expect(model.firstGap.n).toBe(4)
    expect(model.readNext.n).toBe(3)
    expect(model).toMatchObject({ missing: 2, unread: 3, state: 'gaps' })
  })

  it('stretches the run to the highest held issue', () => {
    expect(runModel({ singles: '1–5', released: 3 }).released).toBe(5)
  })

  it('draws skips only when they are passed', () => {
    const publicModel = runModel({ singles: '1, 3', released: 3 })
    expect(publicModel.issues[1].k).toBe('missing')
    const admin = runModel({ singles: '1, 3', skipped: '2', released: 3 })
    expect(admin.issues[1].k).toBe('skip')
    expect(admin).toMatchObject({ missing: 0, skipped: 1 })
  })

  it.each([
    ['unrecorded', { released: 30 }, 'unrecorded'],
    ['a want with nothing owned', { released: 58, wanted: true }, 'want'],
    ['a finished full run', { singles: '1–45', released: 45 }, 'complete'],
    ['a finished run with gaps', { singles: '1–40', released: 45 }, 'gaps'],
    [
      'an ongoing run, up to date',
      { singles: '1–26', released: 26, ongoing: true },
      'up_to_date',
    ],
    [
      'an ongoing run with gaps',
      { singles: '1–20', released: 26, ongoing: true },
      'gaps',
    ],
  ])('says %s', (_, input, state) => {
    expect(runModel(input).state).toBe(state)
  })

  it('keeps a next issue already counted out of the box', () => {
    const counted = runModel({
      singles: '1–3',
      released: 3,
      nextIssue: { number: '3', store_date: '2026-12-02' },
    })
    expect(counted.nextOut).toBeNull()
    const ahead = runModel({
      singles: '1–3',
      released: 3,
      nextIssue: { number: '4', store_date: '2026-12-02' },
    })
    expect(ahead.nextOut.number).toBe('4')
  })
})

describe('boxTiles', () => {
  it('draws Spawn’s 362 issues as 15 tiles', () => {
    const tiles = boxTiles(runModel(SPAWN))
    expect(tiles).toHaveLength(15)
    expect(tiles.filter((tile) => tile.type === 'bundle')).toHaveLength(7)
    expect(tiles[0]).toMatchObject({
      type: 'bundle',
      from: 1,
      to: 100,
      k: 'read',
      count: 100,
    })
  })

  it('bundles twelve even issues and leaves eleven as cells', () => {
    const twelve = boxTiles(runModel({ singles: '1–12, 14', released: 14 }))
    expect(twelve[0]).toMatchObject({ type: 'bundle', from: 1, to: 12 })
    const eleven = boxTiles(runModel({ singles: '1–11, 13', released: 13 }))
    expect(eleven.filter((tile) => tile.type === 'cell')).toHaveLength(13)
  })

  it('opens a bundle into a fold and its cells', () => {
    const model = runModel({ singles: '1–20', released: 20 })
    const tiles = boxTiles(model, new Set([1]))
    expect(tiles[0]).toMatchObject({ type: 'fold', from: 1, to: 20 })
    expect(tiles.slice(1).every((tile) => tile.type === 'cell')).toBe(true)
    expect(tiles).toHaveLength(21)
  })

  it('never bundles a run that alternates', () => {
    const odd = Array.from({ length: 200 }, (_, i) => i * 2 + 1)
    const tiles = boxTiles(runModel({ singles: odd, released: 400 }))
    expect(tiles).toHaveLength(400)
  })

  it('draws a book per edition, read in part', () => {
    const tiles = boxTiles(
      runModel({
        singles: '55–57, 60',
        editions: SAGA_EDITIONS,
        readTo: 51,
        released: 72,
        ongoing: true,
        nextIssue: { number: '73', store_date: '2026-12-02' },
      }),
    )
    const books = tiles.filter((tile) => tile.type === 'book')
    expect(books).toHaveLength(9)
    expect(books[7]).toMatchObject({ k: 'read', readTo: null })
    expect(books[8]).toMatchObject({ k: 'owned', readTo: 51, from: 49 })
    expect(tiles.at(-1)).toMatchObject({ type: 'next', number: '73' })
    // 61–72 is twelve missing issues outside any edition: one bundle.
    expect(tiles.at(-2)).toMatchObject({
      type: 'bundle',
      from: 61,
      to: 72,
      k: 'missing',
    })
  })

  it('draws every edition once when editions overlap', () => {
    const nested = boxTiles(
      runModel({
        editions: [
          { kind: 'Omnibus', label: 'B', from: 1, to: 20 },
          { kind: 'Trade', label: 'A', from: 5, to: 10 },
        ],
        released: 20,
      }),
    )
    expect(nested.map((tile) => tile.edition?.label)).toEqual(['B', 'A'])
    const around = boxTiles(
      runModel({
        editions: [
          { kind: 'Trade', label: 'A', from: 5, to: 10 },
          { kind: 'Omnibus', label: 'B', from: 1, to: 20 },
        ],
        released: 20,
      }),
    )
    expect(around.map((tile) => tile.edition?.label)).toEqual(['B', 'A'])
  })

  it('cuts a range typed past the API’s last issue instead of drawing it', () => {
    const model = runModel({ singles: '1-300000', released: 10 })
    expect(model.released).toBe(9999)
    const editions = runModel({
      editions: [{ kind: 'Trade', label: 'Huge', from: 1, to: 1000000 }],
      released: 10,
    })
    expect(editions.released).toBe(9999)
  })

  it('draws an issue in the first edition that covers it only', () => {
    const tiles = boxTiles(
      runModel({
        editions: [
          { kind: 'Trade', label: 'A', from: 1, to: 6 },
          { kind: 'Omnibus', label: 'B', from: 1, to: 12 },
        ],
        released: 12,
      }),
    )
    expect(tiles.map((tile) => tile.edition?.label)).toEqual(['A', 'B'])
  })
})

describe('lanes', () => {
  it('draws blocks per issue for a short run', () => {
    const spans = laneSpans(runModel({ singles: '1–2, 4', released: 4 }))
    expect(spans.short).toBe(true)
    expect(spans.run.map((span) => span.k)).toEqual([
      'owned',
      'owned',
      'missing',
      'owned',
    ])
  })

  it('draws stretches by proportion for a long run, with a tail when ongoing', () => {
    const spans = laneSpans(runModel(SPAWN))
    expect(spans.short).toBe(false)
    expect(spans.run[0]).toEqual({ k: 'owned', from: 1, to: 100 })
    expect(spans.tail).toBe(true)
    expect(spans.readTo).toBe(100)
  })

  it('carries skips only for an admin model', () => {
    const spans = laneSpans(
      runModel({ singles: '1–3, 7–20', skipped: '4–6', released: 20 }),
    )
    expect(spans.skipped).toEqual([{ k: 'skip', from: 4, to: 6 }])
  })

  it('reads a list row’s segments and drops the upcoming length', () => {
    const spans = laneSpansFromRow({
      segments: [
        { kind: 'owned', length: 50 },
        { kind: 'missing', length: 22 },
        { kind: 'upcoming', length: 6 },
      ],
      read_to: 40,
      ongoing: true,
    })
    expect(spans).toMatchObject({ released: 72, short: false, readTo: 40 })
    expect(spans.run).toEqual([
      { k: 'owned', from: 1, to: 50 },
      { k: 'missing', from: 51, to: 72 },
    ])
  })

  it('splits a short list row into blocks', () => {
    const spans = laneSpansFromRow({
      segments: [{ kind: 'owned', length: 4 }],
      read_to: null,
      ongoing: false,
    })
    expect(spans.run).toHaveLength(4)
    expect(spans.tail).toBe(false)
  })

  it('names the lanes with the facts', () => {
    expect(
      lanesLabel({
        held: 58,
        released: 72,
        missing: 14,
        ongoing: true,
        readTo: 54,
      }),
    ).toBe(
      '58 of 72 issues owned, 14 missing, series still coming out, read to number 54',
    )
  })
})

describe('text', () => {
  it('writes the sentence under the box', () => {
    expect(
      runSentence(runModel({ singles: '1–57, 60', readTo: 54, released: 72 })),
    ).toBe('I own #1–57, 60 and have read to #54.')
    expect(runSentence(runModel({ singles: '1–4', released: 4 }))).toBe(
      'I own #1–4, none read yet.',
    )
  })

  it('writes ranges and counts', () => {
    expect(displayRanges([5, 1, 2, 3])).toBe('1–3, 5')
    expect(countText({ held: 58, released: 72, ongoing: true })).toBe('58/72+')
  })
})

describe('cardLines', () => {
  const row = {
    owned: 58,
    released: 72,
    ongoing: true,
    missing: 14,
    read: 50,
    read_to: 54,
    read_next: 55,
    next_issue: null,
    wanted: false,
  }

  it('leads with the next dated issue', () => {
    expect(
      cardLines(
        { ...row, next_issue: { number: '73', store_date: '2026-12-02' } },
        date,
      ),
    ).toMatchObject({
      count: '58/72+',
      status: 'Next #73 · on 2026-12-02',
      reading: 'read next: #55',
    })
  })

  it.each([
    [{ missing: 14 }, '14 missing'],
    [{ missing: 0, ongoing: true }, 'Up to date'],
    [{ missing: 0, ongoing: false }, 'Complete run'],
  ])('falls back to the run state (%o)', (change, status) => {
    expect(cardLines({ ...row, ...change }, date).status).toBe(status)
  })

  it('says all read, and reads an old snapshot', () => {
    expect(cardLines({ ...row, read_next: null }, date).reading).toBe(
      'all read',
    )
    const old = { ...row }
    delete old.read_next
    expect(cardLines(old, date).reading).toBe('read to #54')
  })

  it('draws no lanes for a want or an unrecorded run', () => {
    expect(
      cardLines({ ...row, owned: 0, wanted: true, released: 58 }, date),
    ).toEqual({
      count: null,
      status: '58 out · none owned',
      reading: null,
      lanes: false,
    })
    expect(cardLines({ ...row, owned: 0 }, date).status).toBe(
      'Issues not recorded',
    )
  })
})

describe('seriesGrowth', () => {
  it('splits what a row brings into added and already held', () => {
    const growth = seriesGrowth({
      ownedText: '1–2, 5–6',
      issues: '6, 3-4',
      released: 8,
      ongoing: true,
    })
    expect(growth.added).toEqual([3, 4])
    expect(growth.already).toEqual([6])
    expect(growth.before.held).toBe(4)
    expect(growth.after.held).toBe(6)
    expect(growth.after.state).toBe('gaps')
  })

  it('brings nothing when nothing is typed', () => {
    const growth = seriesGrowth({ ownedText: '1–4', issues: '', released: 4 })
    expect(growth.added).toEqual([])
    expect(growth.already).toEqual([])
    expect(growth.after.state).toBe('complete')
  })

  it('caps a typo instead of drawing a million issues', () => {
    const growth = seriesGrowth({
      ownedText: '1',
      issues: '2-999999',
      released: 4,
    })
    expect(growth.added.at(-1)).toBe(9999)
  })
})

describe('nearCells', () => {
  const after = (singles, released) => runModel({ singles, released })
  const shape = (tiles) =>
    tiles.map((t) => (t.type === 'gap' ? '…' : `${t.n}${t.k[0]}`)).join(' ')

  it('draws three before and two after the added issues, then a gap', () => {
    // Saga: 1–57 held, 58 added, 72 out.
    const tiles = nearCells(after('1–58', 72), [58])
    expect(shape(tiles)).toBe('… 55o 56o 57o 58n 59m 60m …')
  })

  it('starts at #1 with no leading gap and stops at the last issue', () => {
    const tiles = nearCells(after('1–4', 4), [3, 4])
    expect(shape(tiles)).toBe('1o 2o 3n 4n')
  })

  it('puts a gap between added issues far apart', () => {
    const tiles = nearCells(after('1–60', 60), [3, 50])
    expect(shape(tiles)).toBe('1o 2o 3n 4o 5o … 47o 48o 49o 50n 51o 52o …')
  })

  it('centres on an issue already held when nothing is added', () => {
    const tiles = nearCells(after('1–72', 72), [], [60])
    expect(shape(tiles)).toBe('… 57o 58o 59o 60o 61o 62o …')
  })

  it('is empty with nothing to centre on', () => {
    expect(nearCells(after('1–4', 4), [])).toEqual([])
  })
})
