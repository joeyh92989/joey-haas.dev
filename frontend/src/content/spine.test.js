// @vitest-environment node
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { spine } from './spine.js'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const { how } = spine

describe('spine.how', () => {
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
