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

const spot = {
  spot_id: 's1',
  name: 'Wash Park',
  lat: 39.7,
  lng: -105,
  tags: [],
}

describe('snapshotPresence', () => {
  it('is unknown, not empty, when no snapshot was written', () => {
    expect(snapshotPresence(withSnapshots({}))).toEqual({
      comics: null,
      spots: null,
    })
  })

  it('is unknown when the directory itself is missing', () => {
    expect(snapshotPresence('/nonexistent/snapshot')).toEqual({
      comics: null,
      spots: null,
    })
  })

  it('is false for a snapshot with nothing in it', () => {
    expect(
      snapshotPresence(withSnapshots({ comics: { series: [] }, spots: [] })),
    ).toEqual({ comics: false, spots: false })
  })

  it('is true for a snapshot with a series or a spot', () => {
    expect(
      snapshotPresence(
        withSnapshots({ comics: { series: [{ id: 1 }] }, spots: [spot] }),
      ),
    ).toEqual({ comics: true, spots: true })
  })

  it('is unknown for an unreadable or wrongly shaped file', () => {
    expect(
      snapshotPresence(withSnapshots({ comics: '<!doctype html>', spots: {} })),
    ).toEqual({ comics: null, spots: null })
  })
})
