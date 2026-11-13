import { afterEach, describe, expect, it, vi } from 'vitest'
import { setMark, toggleSkip } from './comicEdits.js'

const ID = '11111111-1111-1111-1111-111111111111'

/** A fetch that serves `stored` for GET and records PATCH bodies. */
function stubApi(stored, patch = { ok: true, status: 200 }) {
  const patches = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      if (options.method === 'PATCH') {
        patches.push(JSON.parse(options.body))
        return { ...patch, json: async () => patch.body ?? {} }
      }
      return { ok: true, status: 200, json: async () => stored }
    }),
  )
  return patches
}

afterEach(() => vi.unstubAllGlobals())

describe('setMark', () => {
  it('posts the state to the mark route and returns the series state', async () => {
    const calls = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, options) => {
        calls.push([url, JSON.parse(options.body), options.method])
        return { ok: true, status: 200, json: async () => ({ read_to: 2 }) }
      }),
    )
    expect(await setMark(ID, 5, 'read')).toEqual({ read_to: 2 })
    expect(calls).toEqual([
      [
        expect.stringContaining(`/api/comics/${ID}/issues/5/mark`),
        { state: 'read' },
        'POST',
      ],
    ])
  })

  it('sends `to` for a whole book', async () => {
    const bodies = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, options) => {
        bodies.push(JSON.parse(options.body))
        return { ok: true, status: 200, json: async () => ({}) }
      }),
    )
    await setMark(ID, 3, 'read', 4)
    expect(bodies).toEqual([{ state: 'read', to: 4 }])
  })

  it('throws the API’s detail on a refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ detail: 'In Book 1.' }),
      })),
    )
    await expect(setMark(ID, 3, 'missing')).rejects.toThrow('In Book 1.')
  })
})

describe('toggleSkip', () => {
  it('adds a skip', async () => {
    const patches = stubApi({ issues_skipped: '3' })
    await toggleSkip(ID, 4)
    expect(patches).toEqual([{ issues_skipped: '3-4' }])
  })

  it('clears a skip', async () => {
    const patches = stubApi({ issues_skipped: '3–4' })
    await toggleSkip(ID, 3)
    expect(patches).toEqual([{ issues_skipped: '4' }])
  })
})
