// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { spine } from './spine.js'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const { how } = spine

describe('spine.how', () => {
  it('names no watched store, by name or by host', () => {
    // Read from the backend's store list, so a new store is covered at once.
    // The tour draws stores as "store withheld"; its copy ships in the JS
    // bundle, which the smoke check on the prerendered page cannot see.
    const stores = readFileSync(
      join(REPO, 'backend', 'physical_sources', 'stores.py'),
      'utf8',
    )
    const names = [...stores.matchAll(/^\s+(?:name|domain)="([^"]+)"/gm)].map(
      (match) => match[1].replace(/^(www|store)\./, '').toLowerCase(),
    )
    expect(names.length).toBeGreaterThanOrEqual(24)
    const copy = JSON.stringify(how).toLowerCase()
    for (const name of names) expect(copy, name).not.toContain(name)
  })

  it('has eight stops, numbered in order, each with its required copy', () => {
    expect(how.stops.map((stop) => stop.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    for (const stop of how.stops) {
      expect(stop.where, `stop ${stop.n}`).toBeTruthy()
      expect(stop.title, `stop ${stop.n}`).toBeTruthy()
      expect(stop.claim, `stop ${stop.n}`).toBeTruthy()
      expect(stop.code.length, `stop ${stop.n}`).toBeGreaterThan(0)
      if (stop.why) expect(stop.why.lead && stop.why.text).toBeTruthy()
      if (stop.live) expect(stop.live.caption && stop.live.empty).toBeTruthy()
    }
  })

  it('points every feature card at a stop that exists', () => {
    const numbers = new Set(how.stops.map((stop) => stop.n))
    expect(how.features).toHaveLength(5)
    for (const feature of how.features) {
      expect(numbers.has(feature.stop), feature.title).toBe(true)
    }
  })

  it('links only code that exists in the repo', () => {
    const paths = how.stops.flatMap((stop) => stop.code)
    for (const path of paths) {
      expect(existsSync(join(REPO, path)), path).toBe(true)
    }
  })

  it('draws every capture table with one cell per column', () => {
    for (const stop of how.stops) {
      const capture = stop.capture
      if (!capture?.rows) continue
      for (const row of capture.rows) {
        expect(row, `stop ${stop.n}`).toHaveLength(capture.columns.length)
      }
    }
  })

  it('has a tab for the page', () => {
    expect(spine.tabs.how.to).toBe(how.path)
  })
})
