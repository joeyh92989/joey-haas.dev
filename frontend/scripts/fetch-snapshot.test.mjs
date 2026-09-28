// @vitest-environment node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSnapshot } from './fetch-snapshot.mjs'

const API = 'https://api.example.test'
const ITEMS = [{ id: '1', title: 'Hades' }]
const STATS = { total: 1, by_status: { finished: 1 } }

let outDir

beforeEach(async () => {
  outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'snapshot-'))
})

afterEach(async () => {
  await fs.rm(outDir, { recursive: true, force: true })
})

const ok = (body) => ({ ok: true, status: 200, json: async () => body })

/** A fetch answering by path; anything unlisted is a 404. */
function api(routes) {
  return vi.fn(async (url) => {
    const route = routes[new URL(url).pathname]
    if (route instanceof Error) throw route
    return route ?? { ok: false, status: 404, json: async () => ({}) }
  })
}

function run(fetchImpl, overrides = {}) {
  let clock = 0
  return fetchSnapshot({
    apiUrl: API,
    outDir,
    fetchImpl,
    sleep: async (ms) => {
      clock += ms
    },
    now: () => clock,
    log: () => {},
    ...overrides,
  })
}

async function written() {
  return (await fs.readdir(outDir)).sort()
}

describe('fetchSnapshot', () => {
  it('does nothing without an API URL, so CI builds stay offline', async () => {
    const fetchImpl = api({})
    expect(await run(fetchImpl, { apiUrl: '' })).toBe('skipped')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await written()).toEqual([])
  })

  it('wakes the API, then writes each body verbatim', async () => {
    const fetchImpl = api({
      '/api/health': ok({ status: 'ok' }),
      '/api/public/items': ok(ITEMS),
      '/api/public/stats': ok(STATS),
    })
    expect(await run(fetchImpl)).toBe('written')
    expect(await written()).toEqual(['items.json', 'stats.json'])
    expect(
      JSON.parse(await fs.readFile(path.join(outDir, 'items.json'), 'utf8')),
    ).toEqual(ITEMS)
    expect(
      JSON.parse(await fs.readFile(path.join(outDir, 'stats.json'), 'utf8')),
    ).toEqual(STATS)
  })

  it('keeps polling health while the API sleeps', async () => {
    let calls = 0
    const fetchImpl = vi.fn(async (url) => {
      const { pathname } = new URL(url)
      if (pathname === '/api/health') {
        calls += 1
        return calls < 3 ? { ok: false, status: 503 } : ok({ status: 'ok' })
      }
      return pathname === '/api/public/items' ? ok(ITEMS) : ok(STATS)
    })
    expect(await run(fetchImpl)).toBe('written')
    expect(calls).toBe(3)
  })

  it('gives up after the wake budget and writes nothing', async () => {
    const fetchImpl = api({ '/api/health': new TypeError('connect refused') })
    expect(await run(fetchImpl)).toBe('failed')
    expect(await written()).toEqual([])
  })

  it('writes neither file when one body has the wrong shape', async () => {
    const fetchImpl = api({
      '/api/health': ok({ status: 'ok' }),
      '/api/public/items': ok(ITEMS),
      '/api/public/stats': ok([]),
    })
    expect(await run(fetchImpl)).toBe('failed')
    expect(await written()).toEqual([])
  })

  it('never rejects, whatever the API does', async () => {
    const fetchImpl = api({
      '/api/health': ok({ status: 'ok' }),
      '/api/public/items': new TypeError('socket hang up'),
    })
    await expect(run(fetchImpl)).resolves.toBe('failed')
  })

  it('retries a data request once after the API wakes but the database has not', async () => {
    let itemCalls = 0
    const fetchImpl = vi.fn(async (url) => {
      const { pathname } = new URL(url)
      if (pathname === '/api/health') return ok({ status: 'ok' })
      if (pathname === '/api/public/items') {
        itemCalls += 1
        if (itemCalls === 1) throw new TypeError('timed out')
        return ok(ITEMS)
      }
      return ok(STATS)
    })
    expect(await run(fetchImpl)).toBe('written')
    expect(itemCalls).toBe(2)
  })

  it('writes nothing when the output path is a file', async () => {
    const blocker = path.join(outDir, 'blocker')
    await fs.writeFile(blocker, 'not a directory')
    const fetchImpl = api({
      '/api/health': ok({ status: 'ok' }),
      '/api/public/items': ok(ITEMS),
      '/api/public/stats': ok(STATS),
    })
    expect(await run(fetchImpl, { outDir: blocker })).toBe('failed')
    expect(await written()).toEqual(['blocker'])
  })

  it('removes its temp files when a later write fails', async () => {
    // A directory squatting on stats' temp name fails the second write.
    await fs.mkdir(path.join(outDir, 'stats.json.tmp'))
    const fetchImpl = api({
      '/api/health': ok({ status: 'ok' }),
      '/api/public/items': ok(ITEMS),
      '/api/public/stats': ok(STATS),
    })
    expect(await run(fetchImpl)).toBe('failed')
    expect(await written()).toEqual(['stats.json.tmp'])
  })
})
