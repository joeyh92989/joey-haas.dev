import { describe, expect, it } from 'vitest'
import { itemPath, monthPath, yearPath } from './spinePaths.js'

describe('spine paths', () => {
  it('ends every page path with a slash', () => {
    expect(itemPath('abc')).toBe('/shelf/abc/')
    expect(yearPath(2026)).toBe('/shelf/year/2026/')
    expect(monthPath('2026-10')).toBe('/shelf/journal/2026-10/')
  })

  it('encodes the item id', () => {
    expect(itemPath('a/b')).toBe('/shelf/a%2Fb/')
  })
})
