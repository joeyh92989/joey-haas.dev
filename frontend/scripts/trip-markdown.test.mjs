import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayDates,
  daySpan,
  parseTripDays,
  parseTripFrontmatter,
} from './trip-markdown.mjs'

const PLACES = [
  { name: 'Dubrovnik', lat: 42.6507, lon: 18.0944 },
  { name: 'Naxos', lat: 37.1036, lon: 25.3767 },
  { name: 'Athens', lat: 37.9838, lon: 23.7275 },
]

const FRONTMATTER = {
  title: 'Croatia & Greece',
  date: '2026-09-12',
  end: '2026-09-23',
  summary: 'Twelve days, three places, one ferry that left on time.',
  cover: 'walls-afternoon',
  places: PLACES,
}

const PHOTO_NAMES = ['walls-afternoon', 'lokrum-from-minceta', 'portara']

/** The trip context parseTripDays takes, with overrides. */
function trip(extra = {}) {
  return {
    slug: 'croatia-greece-2026',
    places: PLACES,
    date: '2026-09-12',
    end: '2026-09-23',
    photoNames: PHOTO_NAMES,
    ...extra,
  }
}

const BODY = `## Day 1 · Arrive · Dubrovnik
Landed late and walked the Stradun at midnight.

## Day 2 · The walls · Dubrovnik
Two kilometres around the top of the old town.

![City walls, late afternoon](walls-afternoon "Limestone polished to glass")
![Lokrum from Minčeta](lokrum-from-minceta)

## Day 4 · Travel day · Dubrovnik → Athens → Naxos
The Blue Star out of gate E7 at half five.

## Day 8–9 · Slow days · Naxos
Repeat of the good parts.
`

describe('parseTripFrontmatter', () => {
  it('normalizes a complete trip', () => {
    const parsed = parseTripFrontmatter(
      FRONTMATTER,
      'croatia-greece-2026',
      PHOTO_NAMES,
    )
    expect(parsed).toEqual({
      title: 'Croatia & Greece',
      date: '2026-09-12',
      end: '2026-09-23',
      precision: 'day',
      summary: 'Twelve days, three places, one ferry that left on time.',
      cover: 'walls-afternoon',
      places: PLACES,
      draft: false,
    })
  })

  it('accepts the Date gray-matter parses an unquoted YAML date into', () => {
    const parsed = parseTripFrontmatter(
      { ...FRONTMATTER, date: new Date('2026-09-12T00:00:00Z') },
      'croatia-greece-2026',
      PHOTO_NAMES,
    )
    expect(parsed.date).toBe('2026-09-12')
  })

  it.each(['title', 'date', 'end', 'summary'])(
    'refuses a missing %s',
    (field) => {
      const data = { ...FRONTMATTER }
      delete data[field]
      expect(() => parseTripFrontmatter(data, 'ireland-2014')).toThrow(
        `trips/ireland-2014.md: missing required frontmatter field: ${field}`,
      )
    },
  )

  it('refuses an end before the start', () => {
    expect(() =>
      parseTripFrontmatter(
        { ...FRONTMATTER, end: '2026-09-01' },
        'croatia-greece-2026',
      ),
    ).toThrow(/end \(2026-09-01\) is before date \(2026-09-12\)/)
  })

  it('refuses a date that is not a calendar day', () => {
    expect(() =>
      parseTripFrontmatter(
        { ...FRONTMATTER, date: '2026-02-30' },
        'croatia-greece-2026',
      ),
    ).toThrow(/date is not a calendar day/)
  })

  it('keeps month and year precision, and refuses anything else', () => {
    expect(
      parseTripFrontmatter(
        { ...FRONTMATTER, precision: 'month' },
        'ireland-2014',
      ).precision,
    ).toBe('month')
    expect(() =>
      parseTripFrontmatter(
        { ...FRONTMATTER, precision: 'week' },
        'ireland-2014',
      ),
    ).toThrow(/precision must be one of day, month, year/)
  })

  it('refuses places that are missing, empty, unusable or repeated', () => {
    expect(() =>
      parseTripFrontmatter({ ...FRONTMATTER, places: [] }, 'ireland-2014'),
    ).toThrow(/places must be a non-empty list/)
    expect(() =>
      parseTripFrontmatter(
        { ...FRONTMATTER, places: [{ name: 'Doolin', lat: 'x', lon: -9.28 }] },
        'ireland-2014',
      ),
    ).toThrow(/places\[0\] \("Doolin"\) has no usable lat/)
    expect(() =>
      parseTripFrontmatter(
        { ...FRONTMATTER, places: [PLACES[0], PLACES[0]] },
        'croatia-greece-2026',
      ),
    ).toThrow(/places lists "Dubrovnik" twice/)
  })

  it('refuses a cover that is not in the manifest', () => {
    expect(() =>
      parseTripFrontmatter(
        { ...FRONTMATTER, cover: 'missing' },
        'croatia-greece-2026',
        ['walls-afternoon'],
      ),
    ).toThrow(/cover "missing" is not in the photo manifest/)
  })

  it('allows a trip with no cover', () => {
    const data = { ...FRONTMATTER }
    delete data.cover
    expect(parseTripFrontmatter(data, 'ireland-2014').cover).toBeNull()
  })
})

describe('parseTripDays', () => {
  it('reads days, places, ranges and photo groups', () => {
    const days = parseTripDays(BODY, trip())
    expect(days.map((day) => day.id)).toEqual([
      'day-1',
      'day-2',
      'day-4',
      'day-8-9',
    ])
    expect(days[0]).toMatchObject({
      label: '1',
      first: 1,
      last: 1,
      title: 'Arrive',
      place: 'Dubrovnik',
      legs: ['Dubrovnik'],
      photos: [],
    })
    expect(days[0].markdown).toBe(
      'Landed late and walked the Stradun at midnight.',
    )
    // A travel day belongs to where it ended, and keeps the whole chain.
    expect(days[2].legs).toEqual(['Dubrovnik', 'Athens', 'Naxos'])
    expect(days[2].place).toBe('Naxos')
    expect(days[3]).toMatchObject({ label: '8–9', first: 8, last: 9 })
  })

  it('lifts photo lines out of the prose, with alt and caption', () => {
    const [, walls] = parseTripDays(BODY, trip())
    expect(walls.photos).toEqual([
      {
        name: 'walls-afternoon',
        alt: 'City walls, late afternoon',
        caption: 'Limestone polished to glass',
      },
      {
        name: 'lokrum-from-minceta',
        alt: 'Lokrum from Minčeta',
        caption: null,
      },
    ])
    expect(walls.markdown).toBe(
      'Two kilometres around the top of the old town.',
    )
    expect(walls.markdown).not.toMatch(/!\[/)
  })

  it('takes a single-quoted caption, which is what prettier leaves behind', () => {
    const [day] = parseTripDays(
      "## Day 1 · Arrive · Dubrovnik\nLanded.\n![A street](walls-afternoon 'Polished to glass')\n",
      trip(),
    )
    expect(day.photos[0].caption).toBe('Polished to glass')
  })

  it('keeps a day with no photo, which the page draws as a postcard', () => {
    const days = parseTripDays(BODY, trip())
    expect(days[0].photos).toHaveLength(0)
    expect(days[3].photos).toHaveLength(0)
  })

  it('leaves ### headings inside a day in its prose', () => {
    const [day] = parseTripDays(
      '## Day 1 · Arrive · Dubrovnik\n### The flight\nLanded late.\n',
      trip(),
    )
    expect(day.markdown).toBe('### The flight\nLanded late.')
  })

  it('refuses a heading that is not a day', () => {
    expect(() =>
      parseTripDays('## Arrive in Dubrovnik\nLanded.\n', trip()),
    ).toThrow(/a day heading is "Day <n> · <title> · <place>"/)
    expect(() =>
      parseTripDays('## Arrive · Dubrovnik · extra\nLanded.\n', trip()),
    ).toThrow(/a day heading starts with "Day"/)
    expect(() => parseTripDays('# Croatia\n', trip())).toThrow(
      /has no "# " heading/,
    )
  })

  it('refuses a label that is not a number or an ascending range', () => {
    expect(() =>
      parseTripDays('## Day one · Arrive · Dubrovnik\nLanded.\n', trip()),
    ).toThrow(/day label "one" is not a number or a range/)
    expect(() =>
      parseTripDays('## Day 9–8 · Slow · Naxos\nRepeat.\n', trip()),
    ).toThrow(/day range "9–8" does not ascend/)
  })

  it('refuses days out of order and past the end of the trip', () => {
    expect(() =>
      parseTripDays(
        '## Day 2 · The walls · Dubrovnik\nWalls.\n\n## Day 1 · Arrive · Dubrovnik\nLanded.\n',
        trip(),
      ),
    ).toThrow(/day 1 does not follow day 2/)
    expect(() =>
      parseTripDays('## Day 13 · Home · Athens\nFlew home.\n', trip()),
    ).toThrow(/day 13 is past the trip's 12 days/)
  })

  it('refuses a place the frontmatter does not list', () => {
    expect(() =>
      parseTripDays('## Day 1 · Arrive · Split\nLanded.\n', trip()),
    ).toThrow(/day 1 names a place not in places: "Split"/)
    expect(() =>
      parseTripDays('## Day 4 · Travel · Dubrovnik → Split\nFerry.\n', trip()),
    ).toThrow(/names a place not in places: "Split"/)
  })

  it('refuses a photo with no alt text', () => {
    expect(() =>
      parseTripDays(
        '## Day 1 · Arrive · Dubrovnik\nLanded.\n![](walls-afternoon)\n',
        trip(),
      ),
    ).toThrow(/the photo "walls-afternoon" has no alt text \(day 1\)/)
  })

  it('refuses a photo that is not in the manifest', () => {
    expect(() =>
      parseTripDays(
        '## Day 1 · Arrive · Dubrovnik\nLanded.\n![A street](unknown)\n',
        trip(),
      ),
    ).toThrow(/the photo "unknown" is not in the photo manifest/)
  })

  it('refuses a kid photo without an explicit opt-in, and allows it with one', () => {
    const body =
      '## Day 1 · Arrive · Dubrovnik\nLanded.\n![At the gate](portara)\n'
    expect(() =>
      parseTripDays(body, trip({ photos: { portara: { kid: true } } })),
    ).toThrow(/the photo "portara" is marked kid: true without publish: true/)
    expect(
      parseTripDays(
        body,
        trip({ photos: { portara: { kid: true, publish: true } } }),
      ),
    ).toHaveLength(1)
  })

  it('refuses a malformed photo line rather than passing it to markdown', () => {
    expect(() =>
      parseTripDays(
        '## Day 1 · Arrive · Dubrovnik\nLanded.\n![A street](photos/walls.jpg)\n',
        trip(),
      ),
    ).toThrow(/a photo line must be/)
  })

  it('refuses the same photo twice in one day', () => {
    expect(() =>
      parseTripDays(
        '## Day 1 · Arrive · Dubrovnik\nLanded.\n![One](walls-afternoon)\n![Two](walls-afternoon)\n',
        trip(),
      ),
    ).toThrow(/uses the photo "walls-afternoon" twice/)
  })

  it('refuses content before the first day, and a file with no day', () => {
    expect(() =>
      parseTripDays('A lede that belongs in summary.\n', trip()),
    ).toThrow(/prose before the first day/)
    expect(() => parseTripDays('\n\n', trip())).toThrow(/no days/)
  })

  it('refuses a day with no prose', () => {
    expect(() =>
      parseTripDays(
        '## Day 1 · Arrive · Dubrovnik\n\n![A street](walls-afternoon)\n',
        trip(),
      ),
    ).toThrow(/day 1 has no prose/)
  })

  it('skips the manifest checks when there is no manifest yet', () => {
    const [day] = parseTripDays(
      '## Day 1 · Arrive · Dubrovnik\nLanded.\n![A street](not-built-yet)\n',
      trip({ photoNames: undefined }),
    )
    expect(day.photos[0].name).toBe('not-built-yet')
  })
})

describe('dates', () => {
  it('counts a span inclusively and adds days across a month', () => {
    expect(daySpan('2026-09-12', '2026-09-23')).toBe(12)
    expect(daySpan('2026-09-12', '2026-09-12')).toBe(1)
    expect(addDays('2026-09-28', 5)).toBe('2026-10-03')
  })

  it('dates a day from the trip start, and a range across both ends', () => {
    const days = parseTripDays(BODY, trip())
    const atDay = { date: '2026-09-12', precision: 'day' }
    expect(dayDates(days[0], atDay)).toEqual({
      from: '2026-09-12',
      to: '2026-09-12',
    })
    expect(dayDates(days[2], atDay)).toEqual({
      from: '2026-09-15',
      to: '2026-09-15',
    })
    expect(dayDates(days[3], atDay)).toEqual({
      from: '2026-09-19',
      to: '2026-09-20',
    })
  })

  it('dates no day when the trip is only dated to the month or year', () => {
    const days = parseTripDays(BODY, trip())
    expect(
      dayDates(days[0], { date: '2014-06-01', precision: 'month' }),
    ).toBeNull()
    expect(
      dayDates(days[0], { date: '2014-01-01', precision: 'year' }),
    ).toBeNull()
  })
})
