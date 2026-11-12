import { describe, expect, it } from 'vitest'
import {
  editionPath,
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

  it('builds issue and edition paths', () => {
    expect(issuePath(5, 58)).toBe('/shelf/5/58/')
    expect(editionPath(5, 'ed-1-6')).toBe('/shelf/5/ed-1-6/')
  })
})
