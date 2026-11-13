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
    expect(names.length).toBeGreaterThanOrEqual(22)
    const copy = JSON.stringify(how).toLowerCase()
    for (const name of names) expect(copy, name).not.toContain(name)
  })

  it('has nine stops, numbered in order, each with its required copy', () => {
    expect(how.stops.map((stop) => stop.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    for (const stop of how.stops) {
      expect(stop.where, `stop ${stop.n}`).toBeTruthy()
      expect(stop.title, `stop ${stop.n}`).toBeTruthy()
      expect(stop.claim, `stop ${stop.n}`).toBeTruthy()
      expect(stop.code.length, `stop ${stop.n}`).toBeGreaterThan(0)
      if (stop.why) expect(stop.why.lead && stop.why.text).toBeTruthy()
      if (stop.live) expect(stop.live.caption && stop.live.empty).toBeTruthy()
    }
  })

  it('names both ways in at stop 1: a shelf photo and a search', () => {
    // The add bar's search ships with intake's PR 3.
    const stop = how.stops.find((s) => s.n === 1)
    expect(stop.claim).toMatch(/photograph a shelf or search for a title/)
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

  it('describes intake at stop 1 and never says a photo is not kept (AC 17)', () => {
    const [one] = how.stops
    expect(one.where).toBe('/admin/collection/add')
    expect(one.capture.url).toBe('/admin/collection/add')
    expect(one.title).toBe('Takes everything in the same way')
    const copy = JSON.stringify(how).toLowerCase()
    expect(copy).not.toContain('nothing from a photo is kept')
    expect(copy).not.toContain('/admin/import')
  })

  it('has a tab for the page', () => {
    expect(spine.tabs.how.to).toBe(how.path)
  })
})

describe('store count copy', () => {
  it('says no store count the watch list does not have', async () => {
    const { projects } = await import('./projects.js')
    const text = JSON.stringify([spine, projects])
    expect(text).not.toMatch(/twelve (boutique )?stores/)
    expect(text).not.toContain('12 watched')
    expect(text).toContain('11 watched')
  })
})
