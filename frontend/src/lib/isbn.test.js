import { describe, expect, it } from 'vitest'
import { cleanIsbn, fillRow, foundLine, labelFor, toIsbn13 } from './isbn.js'

const SAGA = '9781607066019'
const FOUND = {
  found: true,
  isbn: SAGA,
  title: 'Saga',
  subtitle: 'Volume One',
  volume_number: 1,
  publisher: 'Image Comics',
  year: 2012,
  pages: 160,
}

describe('toIsbn13', () => {
  it.each([
    [SAGA, SAGA],
    ['978-1-60706-601-9', SAGA],
    [' 978 1607066019 ', SAGA],
    ['1-60706-601-7', SAGA],
    ['0-8044-2957-x', '9780804429573'],
  ])('reads %s', (text, expected) => {
    expect(toIsbn13(text)).toBe(expected)
  })

  it.each(['', 'abc', '9781607066010', '1607066010', '9771607066019', null])(
    'refuses %s',
    (text) => {
      expect(toIsbn13(text)).toBeNull()
    },
  )

  it('cleans without judging', () => {
    expect(cleanIsbn(' 12-3x ')).toBe('123X')
  })
})

describe('labelFor', () => {
  it('prefers the volume number, then the subtitle, then the title', () => {
    expect(labelFor(FOUND)).toBe('Vol. 1')
    expect(labelFor({ ...FOUND, volume_number: null })).toBe('Volume One')
    expect(labelFor({ ...FOUND, volume_number: null, subtitle: null })).toBe(
      'Saga',
    )
  })
})

describe('fillRow', () => {
  const blank = { kind: '', label: '', from: '', to: '', isbn: '' }

  it('fills a blank label and keeps the ISBN-13', () => {
    expect(fillRow({ ...blank, isbn: '1-60706-601-7' }, FOUND)).toEqual({
      ...blank,
      isbn: SAGA,
      label: 'Vol. 1',
    })
  })

  it('never overwrites typed text', () => {
    const typed = { ...blank, kind: 'Hardcover', label: 'Deluxe', from: '1' }
    expect(fillRow(typed, FOUND)).toEqual({ ...typed, isbn: SAGA })
  })

  it('leaves the row alone on a miss', () => {
    const row = { ...blank, isbn: SAGA }
    expect(fillRow(row, { found: false, reason: 'not_found' })).toBe(row)
  })
})

describe('foundLine', () => {
  it('joins what is known', () => {
    expect(foundLine(FOUND)).toBe(
      'Saga: Volume One · Image Comics · 2012 · 160 pages',
    )
    expect(foundLine({ title: 'Saga' })).toBe('Saga')
  })
})
