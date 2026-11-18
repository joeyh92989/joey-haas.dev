import { describe, expect, it } from 'vitest'
import { kindWord, titleKind } from './titleKind.js'

describe('titleKind', () => {
  it('passes the four kinds through', () => {
    for (const kind of ['run', 'book_line', 'single_book', 'both']) {
      expect(titleKind({ kind })).toBe(kind)
    }
  })

  it('reads a body without a kind, an unknown one, or no block as a run', () => {
    expect(titleKind({})).toBe('run')
    expect(titleKind({ kind: 'toString' })).toBe('run')
    expect(titleKind({ kind: 'omnibus' })).toBe('run')
    expect(titleKind(null)).toBe('run')
    expect(titleKind(undefined)).toBe('run')
  })

  it('says the kind in words', () => {
    expect(kindWord({ kind: 'book_line' })).toBe('Line of books')
    expect(kindWord({ kind: 'single_book' })).toBe('Single book')
    expect(kindWord({ kind: 'both' })).toBe('Books and issues')
    expect(kindWord({})).toBe('Run of issues')
  })
})
