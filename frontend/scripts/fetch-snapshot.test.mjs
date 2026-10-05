// @vitest-environment node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SNAPSHOTS, fetchSnapshot } from './fetch-snapshot.mjs'

const API = 'https://api.example.test'
const ITEMS = [{ id: '1', title: 'Hades' }]
const STATS = { total: 1, by_status: { finished: 1 } }
const NEXT = { tonight: {}, buy_now: [] }

let outDir

beforeEach(async () => {
  outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'snapshot-'))
})

afterEach(async () => {
  await fs.rm(outDir, { recursive: true, force: true })
})

/** A 200 answer. `text` is what the server sent; it defaults to `body` as JSON. */
const ok = (body, text = JSON.stringify(body)) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => text,
})

/** A fetch answering by path; anything unlisted is a 404. */
function api(routes) {
  return vi.fn(async (url) => {
    const route = routes[new URL(url).pathname]
    if (route instanceof Error) throw route
    return (
      route ?? {
        ok: false,
        status: 404,
        json: async () => ({}),
        text: async () => '{}',
      }
    )
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

  it('writes the bytes the API sent, not a re-serialisation of them', async () => {
    const text = '[{"id":"1","community_score":86.0}]'
    const fetchImpl = api({
      '/api/health': ok({ status: 'ok' }),
      '/api/public/items': ok(JSON.parse(text), text),
      '/api/public/stats': ok(STATS),
    })
    expect(await run(fetchImpl)).toBe('written')
    expect(await fs.readFile(path.join(outDir, 'items.json'), 'utf8')).toBe(
      text,
    )
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

  it('removes files an earlier run left when this one fails', async () => {
    await fs.writeFile(path.join(outDir, 'items.json'), '[]')
    await fs.writeFile(path.join(outDir, 'stats.json.tmp'), '{}')
    const fetchImpl = api({ '/api/health': new TypeError('connect refused') })
    expect(await run(fetchImpl)).toBe('failed')
    expect(await written()).toEqual([])
  })

  it('leaves files alone when it is skipped, so an offline build keeps them', async () => {
    await fs.writeFile(path.join(outDir, 'items.json'), '[]')
    expect(await run(api({}), { apiUrl: '' })).toBe('skipped')
    expect(await written()).toEqual(['items.json'])
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

  it('writes the outputs too, and builds without one that fails', async () => {
    const fetchImpl = api({
      '/api/health': ok({ status: 'ok' }),
      '/api/public/items': ok(ITEMS),
      '/api/public/stats': ok(STATS),
      '/api/public/picks': ok([]),
    })
    expect(await run(fetchImpl)).toBe('written')
    expect(await written()).toEqual(['items.json', 'picks.json', 'stats.json'])
  })

  it('clears an earlier output it can no longer fetch, and on failure', async () => {
    await fs.writeFile(path.join(outDir, 'radar.json'), '[]')
    await fs.writeFile(path.join(outDir, 'picks.json.tmp'), '[]')
    const partial = api({
      '/api/health': ok({ status: 'ok' }),
      '/api/public/items': ok(ITEMS),
      '/api/public/stats': ok(STATS),
      '/api/public/picks': ok([]),
    })
    expect(await run(partial)).toBe('written')
    expect(await written()).toEqual(['items.json', 'picks.json', 'stats.json'])

    await fs.writeFile(path.join(outDir, 'radar.json'), '[]')
    const asleep = api({ '/api/health': new TypeError('connect refused') })
    expect(await run(asleep)).toBe('failed')
    expect(await written()).toEqual([])
  })

  it('declares next as optional, accepting its two sections only', () => {
    expect(SNAPSHOTS.next.path).toBe('/api/public/next')
    expect(SNAPSHOTS.next.required).toBe(false)
    expect(SNAPSHOTS.next.valid(NEXT)).toBe(true)
    expect(SNAPSHOTS.next.valid([])).toBe(false)
  })

  it('writes next verbatim when the API serves it', async () => {
    const text = '{"tonight":{},"buy_now":[],"preorders":[]}'
    const fetchImpl = api({
      '/api/health': ok({ status: 'ok' }),
      '/api/public/items': ok(ITEMS),
      '/api/public/stats': ok(STATS),
      '/api/public/next': ok(JSON.parse(text), text),
    })
    expect(await run(fetchImpl)).toBe('written')
    expect(await written()).toEqual(['items.json', 'next.json', 'stats.json'])
    expect(await fs.readFile(path.join(outDir, 'next.json'), 'utf8')).toBe(text)
  })

  it('builds without next when it is missing or has the wrong shape', async () => {
    const base = {
      '/api/health': ok({ status: 'ok' }),
      '/api/public/items': ok(ITEMS),
      '/api/public/stats': ok(STATS),
    }
    // 404: the API has not deployed the endpoint yet.
    expect(await run(api(base))).toBe('written')
    expect(await written()).toEqual(['items.json', 'stats.json'])

    expect(await run(api({ ...base, '/api/public/next': ok([]) }))).toBe(
      'written',
    )
    expect(await written()).toEqual(['items.json', 'stats.json'])
  })
})
