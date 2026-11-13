import { describe, expect, it } from 'vitest'
import {
  entryTitle,
  fieldPayload,
  garmentNeedsCheck,
  localToday,
  meterCounts,
  missingFields,
  optionLabel,
  refuseFile,
  shelfPath,
  sittingLabel,
  sourceWords,
} from './intake.js'

describe('optionLabel for a status', () => {
  it('reads Reading for a comic sitting and Playing otherwise', () => {
    expect(optionLabel('status', 'active', 'comic')).toBe('Reading')
    expect(optionLabel('status', 'active', 'game')).toBe('Playing')
    expect(optionLabel('status', 'active')).toBe('Playing')
    expect(optionLabel('status', 'paused', 'comic')).toBe('Paused')
  })
})

describe('optionLabel', () => {
  it("uses the site's own names where it has them", () => {
    expect(optionLabel('platform_id', '508')).toBe('Nintendo Switch 2')
    expect(optionLabel('disc_format', 'uhd')).toBe('4K UHD')
    expect(optionLabel('status', 'active')).toBe('Playing')
  })

  it('makes an unknown value readable rather than hiding it', () => {
    expect(optionLabel('pressing', 'first_press')).toBe('First press')
  })
})

describe('meterCounts', () => {
  it('counts written states as ready, a probable match as to check, and unread photos as reading', () => {
    expect(
      meterCounts({
        photos_waiting: 2,
        entries: { exact: 3, probable: 1, typed: 1, check: 4, reading: 1 },
      }),
    ).toEqual({ ready: 4, check: 5, reading: 3, owned: 0 })
  })
})

describe('refuseFile', () => {
  const file = (name, type, size = 10) => ({ name, type, size })

  it('names a file of the wrong type', () => {
    expect(refuseFile(file('notes.pdf', 'application/pdf'))).toBe(
      'notes.pdf is application/pdf; upload JPEG, PNG, WebP or HEIC photos',
    )
  })

  it('names a file over the cap', () => {
    expect(refuseFile(file('big.jpg', 'image/jpeg', 20 * 1024 * 1024))).toBe(
      'big.jpg is 20 MB; upload photos of at most 14 MB',
    )
  })

  it('passes a photo the server takes', () => {
    expect(refuseFile(file('shelf.heic', 'image/heic'))).toBeNull()
  })
})

describe('entryTitle', () => {
  it("prefers the match's title, then what was read", () => {
    expect(entryTitle({ chosen: { title: 'Dune' }, payload: {} })).toBe('Dune')
    expect(
      entryTitle({ chosen: null, payload: { detected_title: 'SANDMAN' } }),
    ).toBe('SANDMAN')
  })
})

describe('localToday', () => {
  it('is the local calendar day', () => {
    expect(localToday(new Date(2026, 10, 9, 23, 30))).toBe('2026-11-09')
  })
})

describe('fieldPayload', () => {
  const fields = [
    { key: 'name', control: 'text' },
    { key: 'warmth', control: 'select' },
    { key: 'pages', control: 'number' },
  ]

  it('drops blanks and sends numbers as numbers', () => {
    expect(
      fieldPayload(fields, { name: ' Oxford ', warmth: '', pages: '12' }),
    ).toEqual({
      name: 'Oxford',
      pages: 12,
    })
  })
})

describe('sourceWords', () => {
  it('words each state a source can answer in', () => {
    const kind = { label: 'Comic' }
    expect(
      sourceWords({ state: 'busy', reason: 'comicvine is busy' }, kind),
    ).toBe('Comic: comicvine is busy')
    expect(
      sourceWords({ state: 'not_configured', reason: 'no key' }, kind),
    ).toBe('Comic search is off: no key')
    expect(sourceWords({ state: 'failed', reason: 'bad' }, kind)).toBe(
      'Comic search failed: bad',
    )
    expect(sourceWords({ state: 'ok', reason: null }, kind)).toBeNull()
  })
})

describe('garmentNeedsCheck', () => {
  const garment = (extra) => ({
    status: 'untagged',
    tag_source: null,
    tag_attempts: 0,
    ...extra,
  })

  it('asks only about pieces the tagger gave up on', () => {
    expect(garmentNeedsCheck(garment({ tag_attempts: 3 }))).toBe(true)
    expect(garmentNeedsCheck(garment({ tag_attempts: 1 }))).toBe(false)
    expect(
      garmentNeedsCheck(garment({ tag_attempts: 3, tag_source: 'manual' })),
    ).toBe(false)
    expect(
      garmentNeedsCheck(garment({ status: 'active', tag_attempts: 3 })),
    ).toBe(false)
  })

  it('names the fields the tagger left empty', () => {
    const fields = [
      { key: 'name', label: 'Name' },
      { key: 'category', label: 'Slot' },
      { key: 'warmth', label: 'Warmth' },
    ]
    expect(missingFields(fields, { name: 'Oxford', category: null })).toEqual([
      'Slot',
      'Warmth',
    ])
  })
})

describe('sittingLabel', () => {
  it('is the kind, the day and the time', () => {
    expect(
      sittingLabel({ label: 'Garment' }, new Date('2026-11-11T02:42:00Z')),
    ).toBe('Garment · Nov 10, 7:42 PM')
  })

  it('tells two same-day sittings apart, in Denver time', () => {
    const kind = { label: 'Comic' }
    expect(sittingLabel(kind, new Date('2026-11-12T02:42:00Z'))).toBe(
      'Comic · Nov 11, 7:42 PM',
    )
    expect(sittingLabel(kind, new Date('2026-11-12T04:05:00Z'))).toBe(
      'Comic · Nov 11, 9:05 PM',
    )
  })
})

describe('shelfPath', () => {
  it('sends a comic sitting to Comics, a game or mixed one to Games', () => {
    expect(shelfPath('shelf', 'comic')).toBe('/admin/shelf/comics')
    expect(shelfPath('shelf', 'game')).toBe('/admin/shelf/games')
    expect(shelfPath('shelf', null)).toBe('/admin/shelf/games')
    expect(shelfPath('closet', 'garment')).toBe('/admin/closet')
  })
})
