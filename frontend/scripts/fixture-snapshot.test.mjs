import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SNAPSHOTS } from './fetch-snapshot.mjs'
import { isValidSnapshot } from '../src/lib/snapshot.js'

const dir = path.join(import.meta.dirname, '..', 'e2e', 'fixtures', 'snapshot')
const read = (name) =>
  JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'))

// The browser tests build with these files (e2e/fixtures/README.md). If a
// snapshot's shape changes, this fails instead of the CI e2e job.
describe('e2e fixture snapshot', () => {
  for (const [name, snapshot] of Object.entries(SNAPSHOTS)) {
    if (!fs.existsSync(path.join(dir, `${name}.json`))) continue
    it(`${name}.json passes fetch-snapshot's shape check`, () => {
      expect(snapshot.valid(read(name))).toBe(true)
    })
  }

  it('has every required snapshot', () => {
    for (const [name, snapshot] of Object.entries(SNAPSHOTS)) {
      if (snapshot.required) {
        expect(fs.existsSync(path.join(dir, `${name}.json`))).toBe(true)
      }
    }
  })

  it('passes the app readers for the files the app reads', () => {
    for (const name of ['items', 'stats', 'meta']) {
      expect(isValidSnapshot(name, read(name))).toBe(true)
    }
  })
})
