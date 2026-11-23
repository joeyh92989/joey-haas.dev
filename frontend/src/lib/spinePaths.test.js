import { describe, expect, it } from 'vitest'
import {
  volumePath,
  issuePath,
  isItemId,
  itemKey,
  itemPath,
  itemRowPath,
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

  it('uses the slug when an item has one, else the id (#479)', () => {
    const id = 'c1fc4f22-0000-4000-8000-000000000001'
    expect(itemPath({ id, slug: 'catherine-full-body' })).toBe(
      '/shelf/catherine-full-body/',
    )
    expect(itemPath({ id, slug: null })).toBe(`/shelf/${id}/`)
    expect(itemPath({ id })).toBe(`/shelf/${id}/`)
    expect(itemKey({ id, slug: 'a' })).toBe('a')
    expect(itemKey('a-bare-key')).toBe('a-bare-key')
  })

  it('builds the path of a row that names item_id and item_slug', () => {
    expect(itemRowPath({ item_id: 'x', item_slug: 'saga' })).toBe(
      '/shelf/saga/',
    )
    expect(itemRowPath({ item_id: 'x' })).toBe('/shelf/x/')
    expect(itemRowPath({ item_id: 'x', item_slug: null })).toBe('/shelf/x/')
  })

  it('puts issue and book pages under the slug too', () => {
    const saga = { id: 'x', slug: 'saga' }
    expect(issuePath(saga, 12)).toBe('/shelf/saga/12/')
    expect(volumePath(saga, 'vol-3')).toBe('/shelf/saga/vol-3/')
  })

  it('tells an id from a slug', () => {
    expect(isItemId('c1fc4f22-0000-4000-8000-000000000001')).toBe(true)
    expect(isItemId('catherine-full-body')).toBe(false)
  })

  it('builds issue and book paths', () => {
    expect(issuePath(5, 58)).toBe('/shelf/5/58/')
    expect(volumePath(5, 'ed-1-6')).toBe('/shelf/5/ed-1-6/')
    expect(volumePath(5, 'vol-3')).toBe('/shelf/5/vol-3/')
  })
})
