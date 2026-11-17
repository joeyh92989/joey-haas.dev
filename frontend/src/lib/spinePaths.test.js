import { describe, expect, it } from 'vitest'
import {
  volumePath,
  issuePath,
  itemPath,
  monthPath,
  yearPath,
} from './spinePaths.js'

describe('spine paths', () => {
  it('ends every page path with a slash', () => {
    expect(itemPath('abc')).toBe('/shelf/abc/')
    expect(yearPath(2026)).toBe('/shelf/year/2026/')
    expect(monthPath('2026-10')).toBe('/shelf/journal/2026-10/')
  })

  it('encodes the item id', () => {
    expect(itemPath('a/b')).toBe('/shelf/a%2Fb/')
  })

  it('builds issue and book paths', () => {
    expect(issuePath(5, 58)).toBe('/shelf/5/58/')
    expect(volumePath(5, 'ed-1-6')).toBe('/shelf/5/ed-1-6/')
    expect(volumePath(5, 'vol-3')).toBe('/shelf/5/vol-3/')
  })
})
