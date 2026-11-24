import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('hiddenPathsFor', () => {
  it('hides nothing while a snapshot is missing (null or absent)', async () => {
    const { hiddenPathsFor } = await import('./snapshotPresence.js')
    expect(hiddenPathsFor({ comics: null, games: null })).toEqual([])
    expect(hiddenPathsFor({})).toEqual([])
  })

  it('hides the page whose snapshot is written and empty', async () => {
    const { hiddenPathsFor } = await import('./snapshotPresence.js')
    expect(hiddenPathsFor({ comics: false })).toEqual(['/shelf/comics'])
    expect(hiddenPathsFor({ comics: false, games: false })).toEqual([
      '/shelf/comics',
      '/shelf/games',
    ])
  })

  it('hides Games when the items snapshot holds no game', async () => {
    const { hiddenPathsFor } = await import('./snapshotPresence.js')
    expect(hiddenPathsFor({ games: false, comics: true })).toEqual([
      '/shelf/games',
    ])
  })

  it('hides nothing when both snapshots have something', async () => {
    const { hiddenPathsFor } = await import('./snapshotPresence.js')
    expect(hiddenPathsFor({ comics: true, games: true })).toEqual([])
  })
})

describe('isHiddenPath', () => {
  it('judges the pathname: fragment, query and trailing slash ignored', async () => {
    const { isHiddenPath } = await import('./snapshotPresence.js')
    const hidden = ['/shelf/comics']
    for (const href of [
      '/shelf/comics',
      '/shelf/comics#top',
      '/shelf/comics/',
      '/shelf/comics?a=1#b',
    ]) {
      expect(isHiddenPath(href, hidden)).toBe(true)
    }
    for (const href of [
      '/',
      '/shelf/comics-trip',
      '/travel/shelf/comics',
      '/about#shelf/comics',
    ]) {
      expect(isHiddenPath(href, hidden)).toBe(false)
    }
  })
})

describe('snapshotPresence', () => {
  it('shows the links when the build had no answer (dev, tests)', async () => {
    const presence = await import('./snapshotPresence.js')
    expect(presence.hasComics).toBe(true)
    expect(presence.hasGames).toBe(true)
  })

  it('shows a link while its snapshot is unknown', async () => {
    vi.stubGlobal('__SNAPSHOT_PRESENCE__', { comics: null, games: null })
    const presence = await import('./snapshotPresence.js')
    expect(presence.hasComics).toBe(true)
    expect(presence.hasGames).toBe(true)
  })

  it('hides only what the snapshot says is empty', async () => {
    vi.stubGlobal('__SNAPSHOT_PRESENCE__', { comics: false, games: true })
    const presence = await import('./snapshotPresence.js')
    expect(presence.hasComics).toBe(false)
    expect(presence.hasGames).toBe(true)
  })
})
