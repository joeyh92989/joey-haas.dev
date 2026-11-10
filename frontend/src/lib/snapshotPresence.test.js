import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
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
