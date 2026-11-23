import { describe, expect, it } from 'vitest'
import {
  bookFigures,
  chipCounts,
  comicPayload,
  comicErrorField,
  bookRows,
  parseBookRows,
  withoutLegacyEditions,
  compactRanges,
  expandRanges,
  filterComics,
  publishersByCount,
  searchComics,
  monthYear,
  shortDate,
  sortComics,
  kindSummary,
  titleQualifiers,
  volumesOwnedText,
} from './comics.js'

const row = (overrides) => ({
  item_id: overrides.title,
  publisher: null,
  following: false,
  wanted: false,
  run_state: 'gaps',
  owned: 3,
  read: 3,
  missing: 0,
  next_issue: null,
  ...overrides,
})

describe('ranges', () => {
  it('expands the canonical en dash and a typed hyphen alike', () => {
    expect(expandRanges('1–3, 5, 7-8')).toEqual([1, 2, 3, 5, 7, 8])
    expect(expandRanges('')).toEqual([])
    expect(expandRanges(null)).toEqual([])
  })

  it('compacts numbers into hyphenated ranges, deduplicated', () => {
    expect(compactRanges([5, 1, 2, 3, 3, 9, 10])).toBe('1-3, 5, 9-10')
    expect(compactRanges([])).toBe('')
  })

  it('round-trips through the two', () => {
    expect(expandRanges(compactRanges([1, 2, 4, 6, 7]))).toEqual([
      1, 2, 4, 6, 7,
    ])
  })
})

describe('labels', () => {
  it('dates in UTC, so a week never shifts a day', () => {
    expect(shortDate('2026-11-11')).toBe('Nov 11')
  })

  it('captions a cover with month and year, in UTC', () => {
    expect(monthYear('1997-08-01')).toBe('Aug 1997')
    expect(monthYear('2026-12-31')).toBe('Dec 2026')
  })
})

describe('chips, search and sorts', () => {
  const rows = [
    row({ title: 'Saga', publisher: 'Image', following: true, read: 1 }),
    row({ title: 'Monstress', publisher: 'Image', run_state: 'complete' }),
    row({ title: 'Hellboy', publisher: 'Dark Horse', missing: 4 }),
    row({ title: 'Want me', wanted: true, run_state: null }),
  ]

  it('counts and filters by chip and publisher', () => {
    expect(chipCounts(rows)).toEqual({
      all: 4,
      following: 1,
      gaps: 2,
      unread: 1,
      want: 1,
      books: 0,
      issues: 4,
    })
    expect(filterComics(rows, 'gaps', 'Image').map((r) => r.title)).toEqual([
      'Saga',
    ])
    expect(filterComics(rows, 'nonsense')).toHaveLength(4)
  })

  it('lists publishers most first and ignores unknown ones', () => {
    expect(publishersByCount(rows)).toEqual([
      { publisher: 'Image', count: 2 },
      { publisher: 'Dark Horse', count: 1 },
    ])
  })

  it('searches titles ignoring case', () => {
    expect(searchComics(rows, ' SAG ').map((r) => r.title)).toEqual(['Saga'])
    expect(searchComics(rows, '')).toBe(rows)
  })

  it('sorts as the API does', () => {
    const dated = [
      row({
        title: 'B',
        next_issue: { number: '2', store_date: '2026-11-18' },
      }),
      row({ title: 'A' }),
      row({
        title: 'C',
        next_issue: { number: '9', store_date: '2026-11-11' },
      }),
    ]
    expect(sortComics(dated, 'next').map((r) => r.title)).toEqual([
      'C',
      'B',
      'A',
    ])
    expect(sortComics(rows, 'publisher').map((r) => r.title)).toEqual([
      'Hellboy',
      'Monstress',
      'Saga',
      'Want me',
    ])
    expect(sortComics(rows, 'missing')[0].title).toBe('Hellboy')
  })
})

describe('the Books and Single issues chips', () => {
  const rows = [
    row({ title: 'Saga' }),
    row({ title: 'Both', kind: 'both' }),
    row({ title: 'Line', kind: 'book_line' }),
    row({ title: 'One', kind: 'single_book' }),
    row({ title: 'Old snapshot' }),
  ]
  const titles = (chip) => filterComics(rows, chip).map((r) => r.title)

  it('Books is every title that holds books', () => {
    expect(titles('books')).toEqual(['Both', 'Line', 'One'])
  })

  it('Single issues is every title that holds issues; a row with no kind is a run', () => {
    expect(titles('issues')).toEqual(['Saga', 'Both', 'Old snapshot'])
  })

  it('counts them from the whole list and composes with a publisher', () => {
    expect(chipCounts(rows)).toMatchObject({ books: 3, issues: 3 })
    const mixed = [
      row({ title: 'A', kind: 'book_line', publisher: 'Image' }),
      row({ title: 'B', kind: 'book_line', publisher: 'DC' }),
    ]
    expect(filterComics(mixed, 'books', 'DC').map((r) => r.title)).toEqual([
      'B',
    ])
  })
})

describe('volumesOwnedText', () => {
  it.each([
    [[1], 0, undefined, 'Vol. 1'],
    [[2], 0, undefined, 'Vol. 2'],
    [[1, 2], 0, undefined, 'Vol. 1 and 2'],
    [[1, 2, 4], 0, undefined, 'Vol. 1, 2 and 4'],
    [[1, 2, 3], 0, undefined, 'Vol. 1, 2 and 3'],
    // Out of order and repeated numbers are read as a set.
    [[4, 1, 2, 2], 0, undefined, 'Vol. 1, 2 and 4'],
    // Eight numbers or fewer stay plain, even a run of three or more.
    [[1, 2, 3, 4, 5, 6, 7, 8], 0, undefined, 'Vol. 1, 2, 3, 4, 5, 6, 7 and 8'],
    // More than eight: a consecutive run of three or more is "a to b".
    [
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15],
      0,
      undefined,
      'Vol. 1 to 12, 14 and 15',
    ],
    // A run of two stays two numbers.
    [
      [1, 2, 4, 5, 6, 7, 9, 10, 12],
      0,
      undefined,
      'Vol. 1, 2, 4 to 7, 9, 10 and 12',
    ],
    [[1, 2, 3, 4, 5, 6, 7, 8, 9], 0, undefined, 'Vol. 1 to 9'],
  ])('numbers %j, %i unnumbered -> %s', (numbers, unnumbered, size, text) => {
    expect(volumesOwnedText(numbers, unnumbered, size)).toBe(text)
  })

  it('adds the books with no number, as the API counts them', () => {
    expect(volumesOwnedText([1, 2, 4], 1)).toBe(
      'Vol. 1, 2 and 4, and 1 book with no number',
    )
    expect(volumesOwnedText([1], 2)).toBe('Vol. 1, and 2 books with no number')
    expect(volumesOwnedText([], 2)).toBe('2 books with no number')
    expect(volumesOwnedText([], 1)).toBe('1 book with no number')
  })

  it('says nothing is unnumbered for two books that share a number', () => {
    // Two owned books both numbered 3: the API sends [3] and 0 unnumbered.
    expect(volumesOwnedText([3], 0)).toBe('Vol. 3')
    expect(volumesOwnedText([3, 3], 0)).toBe('Vol. 3')
  })

  it('says nothing for no books at all', () => {
    expect(volumesOwnedText([], 0)).toBe('')
    expect(volumesOwnedText(undefined, 0)).toBe('')
  })

  it('prints "of N" only when a line size is given, which nothing passes yet', () => {
    expect(volumesOwnedText([1, 2, 4], 0)).not.toMatch(/ of /)
    expect(volumesOwnedText([1, 2, 4], 0, 6)).toBe('Vol. 1, 2 and 4 of 6')
    expect(volumesOwnedText([1], 0, 6)).toBe('Vol. 1 of 6')
    // No number to be "of" a size: the size is left out.
    expect(volumesOwnedText([], 2, 6)).toBe('2 books with no number')
    expect(volumesOwnedText([1], 2, 0)).not.toMatch(/ of /)
  })
})

describe('kindSummary', () => {
  it('names the kind and says which volumes a title with books holds', () => {
    expect(kindSummary(row({ title: 'Run' }))).toEqual({
      kind: 'run',
      word: 'Run of issues',
      volumes: null,
    })
    expect(
      kindSummary(
        row({
          kind: 'book_line',
          volumes_owned: 3,
          volume_numbers: [1, 2, 4],
        }),
      ),
    ).toEqual({
      kind: 'book_line',
      word: 'Line of books',
      volumes: 'Vol. 1, 2 and 4',
    })
    expect(
      kindSummary(
        row({ kind: 'single_book', volumes_owned: 1, volume_numbers: [3] }),
      ).volumes,
    ).toBe('Vol. 3')
    // An unnumbered single book says nothing past its kind.
    expect(
      kindSummary(
        row({ kind: 'single_book', volumes_owned: 1, volume_numbers: [] }),
      ).volumes,
    ).toBeNull()
    expect(
      kindSummary(
        row({ kind: 'both', volumes_owned: 2, volume_numbers: [1, 3] }),
      ),
    ).toMatchObject({ word: 'Books and issues', volumes: 'Vol. 1 and 3' })
  })

  it('counts "no number" only for books with no line number', () => {
    // Two owned books share line number 3: both are numbered.
    expect(
      kindSummary(
        row({
          kind: 'book_line',
          volumes_owned: 2,
          volume_numbers: [3],
          volumes_unnumbered: 0,
        }),
      ).volumes,
    ).toBe('Vol. 3')
    expect(
      kindSummary(
        row({
          kind: 'book_line',
          volumes_owned: 2,
          volume_numbers: [3],
          volumes_unnumbered: 1,
        }),
      ).volumes,
    ).toBe('Vol. 3, and 1 book with no number')
  })

  it('reads an older row or an unknown kind as a run', () => {
    expect(kindSummary(row({ kind: 'mystery' })).kind).toBe('run')
    expect(kindSummary(row({ kind: 'book_line' })).volumes).toBeNull()
  })
})

describe('book rows', () => {
  const books = [
    { kind: 'Trade', label: 'Vol. 1', from: 1, to: 6 },
    { kind: 'Single', label: 'Variant', from: 7, to: 7 },
  ]

  it('reads its own rows back', () => {
    expect(bookRows(null)).toEqual([])
    expect(parseBookRows(bookRows(books))).toEqual({
      books,
      error: null,
    })
  })

  it('drops a blank row and reads a missing "to" as one issue', () => {
    expect(
      parseBookRows([
        { kind: ' Trade ', label: 'Vol. 2', from: '7', to: '' },
        { kind: '', label: '', from: '', to: '' },
      ]),
    ).toEqual({
      books: [{ kind: 'Trade', label: 'Vol. 2', from: 7, to: 7 }],
      error: null,
    })
    expect(parseBookRows([])).toEqual({ books: null, error: null })
  })

  it('carries an ISBN, and keeps a row that has only that', () => {
    const typed = [
      {
        kind: 'Trade',
        label: 'Vol. 1',
        from: '1',
        to: '6',
        isbn: ' 978-1-60706-601-9 ',
      },
    ]
    expect(parseBookRows(typed).books).toEqual([
      { kind: 'Trade', label: 'Vol. 1', from: 1, to: 6, isbn: '9781607066019' },
    ])
    expect(bookRows([{ ...books[0], isbn: '9781607066019' }])[0].isbn).toBe(
      '9781607066019',
    )
    expect(
      parseBookRows([{ kind: '', label: '', from: '', to: '', isbn: '9' }])
        .error,
    ).toMatch('Book 1')
  })

  it('refuses a half-typed ISBN by row, and reads back what it stores', () => {
    const half = [
      { kind: 'Trade', label: 'Vol. 1', from: '1', to: '6', isbn: '97816' },
    ]
    const bad = parseBookRows(half)
    expect(bad.books).toBeNull()
    expect(bad.error).toMatch(/^Book 1: that ISBN is not valid/)
    // The editor's rows (typed form) parse to the stored ISBN-13, so the
    // Details editor does not snap back after a save.
    const typed = [{ ...half[0], isbn: '1-60706-601-7' }]
    const stored = [
      { kind: 'Trade', label: 'Vol. 1', from: 1, to: 6, isbn: '9781607066019' },
    ]
    expect(parseBookRows(typed).books).toEqual(stored)
  })

  it('names the row it cannot read', () => {
    expect(
      parseBookRows([
        { kind: 'Trade', label: 'Vol. 1', from: '1', to: '6' },
        { kind: 'Trade', label: '', from: 'x', to: '' },
      ]),
    ).toEqual({
      books: null,
      error: 'Book 2: give it a kind, a label and the issues it collects.',
    })
  })
})

describe('comicErrorField', () => {
  it.each([
    ['Issues owned: 4-2 runs backwards', 'issues_owned'],
    ['Issues skipped: x is not a range', 'issues_skipped'],
    ['#7 is owned, so it can’t be skipped', 'issues_skipped'],
    ["#7 is owned, so it can't be skipped", 'issues_skipped'],
    ['Read to runs 1 to 9999', 'read_to'],
    ['editions are retired: add books as volumes', null],
    ['Nothing has changed.', null],
    [undefined, null],
  ])('places %s', (detail, field) => {
    expect(comicErrorField(detail)).toBe(field)
  })
})

describe('comicPayload', () => {
  it('sends blanks as null and no editions key', () => {
    expect(
      comicPayload({
        issues_owned: '  ',
        issues_skipped: '',
        read_to: '',
        shelf_format: '',
        following: false,
      }),
    ).toEqual({
      fields: {
        issues_owned: null,
        issues_skipped: null,
        read_to: null,
        shelf_format: null,
        following: false,
      },
      error: null,
    })
  })

  it('trims the ranges and numbers the read marker', () => {
    const { fields } = comicPayload({
      issues_owned: ' 1-54, 60 ',
      issues_skipped: ' 58 ',
      read_to: '40',
      shelf_format: 'trades',
      following: true,
    })
    expect(fields).toMatchObject({
      issues_owned: '1-54, 60',
      issues_skipped: '58',
      read_to: 40,
      shelf_format: 'trades',
      following: true,
    })
  })
})

describe('bookFigures', () => {
  const row = (fields) => ({
    wanted: false,
    ongoing: false,
    owned: 0,
    released: null,
    read: 0,
    issues_read: 0,
    kind: 'run',
    volumes_owned: 0,
    volume_numbers: [],
    ...fields,
  })

  it('counts owned volumes, a one-issue book once, and gaps up to the highest', () => {
    const rows = [
      // Vol. 1, 2 and 4 of a line: 3 books, Vol. 3 missing.
      row({ kind: 'book_line', volumes_owned: 3, volume_numbers: [1, 2, 4] }),
      // Vol. 1 and 5: 2 books, 3 missing.
      row({ kind: 'book_line', volumes_owned: 2, volume_numbers: [1, 5] }),
      // A one-issue trade held as a single: 1 book.
      row({ owned: 1, released: 1, read: 9, issues_read: 1 }),
      // A volume and the same one-issue run: the volume only.
      row({ kind: 'both', owned: 1, released: 1, volumes_owned: 1 }),
      // A first issue of a running series is not a book.
      row({ owned: 1, released: 1, ongoing: true }),
      // A want is not a book.
      row({ wanted: true, released: 1, owned: 1 }),
    ]
    expect(bookFigures(rows)).toEqual({
      books: 7,
      volumesMissing: 4,
      issuesRead: 1,
      hasLine: true,
    })
  })

  it('is all zero over nothing', () => {
    expect(bookFigures([])).toEqual({
      books: 0,
      volumesMissing: 0,
      issuesRead: 0,
      hasLine: false,
    })
  })

  it('adds no missing for a line with no numbered book', () => {
    expect(
      bookFigures([row({ kind: 'book_line', volumes_owned: 2 })])
        .volumesMissing,
    ).toBe(0)
  })
})

describe('withoutLegacyEditions', () => {
  const old = [{ kind: 'Trade', label: 'Vol. 1', from: 1, to: 6 }]

  it('moves a stored payload’s editions to books', () => {
    expect(withoutLegacyEditions({ issues_owned: '2', editions: old })).toEqual(
      { issues_owned: '2', books: old },
    )
  })

  it('lets books win, drops an empty list, and leaves other payloads alone', () => {
    const books = [{ ...old[0], label: 'New' }]
    expect(withoutLegacyEditions({ books, editions: old })).toEqual({ books })
    expect(withoutLegacyEditions({ editions: [] })).toEqual({})
    const plain = { issues_owned: '1' }
    expect(withoutLegacyEditions(plain)).toBe(plain)
  })
})

describe('titleQualifiers (#474)', () => {
  const row = (id, title, fields = {}) => ({
    item_id: id,
    title,
    year: null,
    publisher: null,
    kind: 'run',
    owned: 0,
    volume_numbers: [],
    ...fields,
  })

  it('says nothing for a title only one row has', () => {
    expect(
      titleQualifiers([row('a', 'Saga'), row('b', 'Monstress')]).size,
    ).toBe(0)
  })

  it('uses the year when it tells the twins apart', () => {
    const out = titleQualifiers([
      row('a', 'Creepshow', { year: 1982, publisher: 'DC' }),
      row('b', 'Creepshow', { year: 2023, publisher: 'DC' }),
    ])
    expect([...out]).toEqual([
      ['a', '1982'],
      ['b', '2023'],
    ])
  })

  it('falls to the publisher, then both, then the shape', () => {
    expect([
      ...titleQualifiers([
        row('a', 'Creepshow', { publisher: 'DC' }),
        row('b', 'Creepshow', { publisher: 'Image' }),
      ]).values(),
    ]).toEqual(['DC', 'Image'])
    expect([
      ...titleQualifiers([
        row('a', 'Creepshow', { year: 2020, publisher: 'DC' }),
        row('b', 'Creepshow', { year: 2020, publisher: 'Image' }),
      ]).values(),
    ]).toEqual(['DC', 'Image'])
    expect([
      ...titleQualifiers([
        row('a', 'Creepshow', { year: 2020, owned: 3 }),
        row('b', 'Creepshow', { year: 2020, kind: 'book_line' }),
      ]).values(),
    ]).toEqual(['2020 · Run of issues, 3 issues', '2020 · Line of books'])
  })

  it('numbers twins that nothing else separates, ignoring case', () => {
    const out = titleQualifiers([
      row('a', 'Creepshow'),
      row('b', 'creepshow'),
      row('c', 'Creepshow'),
    ])
    expect([...out.values()]).toEqual([
      'Run of issues · 1 of 3',
      'Run of issues · 2 of 3',
      'Run of issues · 3 of 3',
    ])
  })
})
