import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('hiddenPathsFor', () => {
  it('hides nothing while a snapshot is missing (null or absent)', async () => {
    const { hiddenPathsFor } = await import('./snapshotPresence.js')
    expect(hiddenPathsFor({ comics: null, spots: null })).toEqual([])
    expect(hiddenPathsFor({})).toEqual([])
  })

  it('hides the page whose snapshot is written and empty', async () => {
    const { hiddenPathsFor } = await import('./snapshotPresence.js')
    expect(hiddenPathsFor({ comics: true, spots: false })).toEqual(['/denver'])
    expect(hiddenPathsFor({ comics: false, spots: true })).toEqual([
      '/shelf/comics',
    ])
    expect(hiddenPathsFor({ comics: false, spots: false })).toEqual([
      '/denver',
      '/shelf/comics',
    ])
  })

  it('hides Games when the items snapshot holds no game', async () => {
    const { hiddenPathsFor } = await import('./snapshotPresence.js')
    expect(hiddenPathsFor({ games: false, comics: true, spots: true })).toEqual(
      ['/shelf/games'],
    )
  })

  it('hides nothing when both snapshots have something', async () => {
    const { hiddenPathsFor } = await import('./snapshotPresence.js')
    expect(hiddenPathsFor({ comics: true, spots: true })).toEqual([])
  })
})

describe('isHiddenPath', () => {
  it('judges the pathname: fragment, query and trailing slash ignored', async () => {
    const { isHiddenPath } = await import('./snapshotPresence.js')
    const hidden = ['/denver']
    for (const href of [
      '/denver',
      '/denver#map',
      '/denver/',
      '/denver?a=1#b',
    ]) {
      expect(isHiddenPath(href, hidden)).toBe(true)
    }
    for (const href of [
      '/',
      '/denver-trip',
      '/travel/denver',
      '/about#denver',
    ]) {
      expect(isHiddenPath(href, hidden)).toBe(false)
    }
  })
})

describe('snapshotPresence', () => {
  it('shows both links when the build had no answer (dev, tests)', async () => {
    const presence = await import('./snapshotPresence.js')
    expect(presence.hasComics).toBe(true)
    expect(presence.hasSpots).toBe(true)
  })

  it('shows a link while its snapshot is unknown', async () => {
    vi.stubGlobal('__SNAPSHOT_PRESENCE__', { comics: null, spots: null })
    const presence = await import('./snapshotPresence.js')
    expect(presence.hasComics).toBe(true)
    expect(presence.hasSpots).toBe(true)
  })

  it('hides only what the snapshot says is empty', async () => {
    vi.stubGlobal('__SNAPSHOT_PRESENCE__', { comics: false, spots: true })
    const presence = await import('./snapshotPresence.js')
    expect(presence.hasComics).toBe(false)
    expect(presence.hasSpots).toBe(true)
  })
})
