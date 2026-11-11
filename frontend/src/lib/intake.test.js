import { describe, expect, it } from 'vitest'
import {
  entryTitle,
  localToday,
  meterCounts,
  optionLabel,
  refuseFile,
} from './intake.js'

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
  it('counts written states as ready and unread photos as reading', () => {
    expect(
      meterCounts({
        photos_waiting: 2,
        entries: { exact: 3, probable: 1, typed: 1, check: 4, reading: 1 },
      }),
    ).toEqual({ ready: 5, check: 4, reading: 3, owned: 0 })
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
