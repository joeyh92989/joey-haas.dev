import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { snapshotPresence } from './snapshot-presence.mjs'

let dir

function withSnapshots(files) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'presence-'))
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(
      path.join(dir, `${name}.json`),
      typeof body === 'string' ? body : JSON.stringify(body),
    )
  }
  return dir
}

afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true })
  dir = undefined
})

describe('snapshotPresence', () => {
  it('is unknown, not empty, when no snapshot was written', () => {
    expect(snapshotPresence(withSnapshots({}))).toEqual({
      games: null,
      comics: null,
    })
  })

  it('is unknown when the directory itself is missing', () => {
    expect(snapshotPresence('/nonexistent/snapshot')).toEqual({
      games: null,
      comics: null,
    })
  })

  it('is false for a snapshot with nothing in it', () => {
    expect(snapshotPresence(withSnapshots({ comics: { series: [] } }))).toEqual(
      { games: null, comics: false },
    )
  })

  it('counts games only in the items snapshot, which holds every type', () => {
    const comic = { id: '1', type: 'comic' }
    const game = { id: '2', type: 'game' }
    expect(snapshotPresence(withSnapshots({ items: [comic] })).games).toBe(
      false,
    )
    expect(
      snapshotPresence(withSnapshots({ items: [comic, game] })).games,
    ).toBe(true)
    expect(snapshotPresence(withSnapshots({ items: {} })).games).toBeNull()
  })

  it('is true for a snapshot with a series', () => {
    expect(
      snapshotPresence(withSnapshots({ comics: { series: [{ id: 1 }] } })),
    ).toEqual({ games: null, comics: true })
  })

  it('is unknown for an unreadable or wrongly shaped file', () => {
    expect(
      snapshotPresence(withSnapshots({ comics: '<!doctype html>' })),
    ).toEqual({ games: null, comics: null })
  })
})
