import { describe, expect, it } from 'vitest'
import { hasHome, itemEditPath, kindSegment, MIXED_KIND } from './intake.js'
import { stashFiles, takeFiles } from './intakeHandoff.js'

describe('intakeHandoff', () => {
  it('hands files over once, then nothing', () => {
    stashFiles('b1', ['a', 'b'])
    expect(takeFiles('b1')).toEqual(['a', 'b'])
    expect(takeFiles('b1')).toEqual([])
  })

  it('keeps one batch’s files from another', () => {
    stashFiles('b1', ['a'])
    expect(takeFiles('b2')).toEqual([])
    expect(takeFiles('b1')).toEqual(['a'])
  })
})

describe('Add kinds', () => {
  it('offers only kinds that have a list to find them in', () => {
    expect(['game', 'comic', 'garment'].map((key) => hasHome({ key }))).toEqual(
      [true, true, true],
    )
    expect(hasHome({ key: 'movie' })).toBe(false)
    expect(hasHome({ key: 'boardgame' })).toBe(false)
    expect(hasHome(undefined)).toBe(false)
  })

  it('names the mixed shelf `mixed` in the URL', () => {
    expect(kindSegment(MIXED_KIND)).toBe('mixed')
    expect(kindSegment({ key: 'comic' })).toBe('comic')
  })

  it('opens a comic on its own page and any other kind on the item page', () => {
    expect(itemEditPath('comic', 'c1')).toBe('/admin/shelf/comics/c1')
    expect(itemEditPath('game', 'g1')).toBe('/admin/collection/g1')
  })
})
