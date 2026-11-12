import { afterEach, describe, expect, it, vi } from 'vitest'
import { setReadTo, toggleOwned, toggleSkip } from './comicEdits.js'

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

describe('toggleOwned', () => {
  it('adds an issue to the owner’s own ranges', async () => {
    const patches = stubApi({ issues_owned: '1–4', issues_skipped: null })
    await toggleOwned(ID, 5)
    expect(patches).toEqual([{ issues_owned: '1-5' }])
  })

  it('removes an issue that is already owned', async () => {
    const patches = stubApi({ issues_owned: '1–5' })
    await toggleOwned(ID, 3)
    expect(patches).toEqual([{ issues_owned: '1-2, 4-5' }])
  })

  it('goes to the wanted state when one is given', async () => {
    const patches = stubApi({ issues_owned: '1–5' })
    await toggleOwned(ID, 3, true)
    expect(patches).toEqual([{ issues_owned: '1-5' }])
  })

  it('drops the skip when owning a skipped issue', async () => {
    const patches = stubApi({ issues_owned: '1–4', issues_skipped: '5, 9' })
    await toggleOwned(ID, 5)
    expect(patches).toEqual([{ issues_owned: '1-5', issues_skipped: '9' }])
  })

  it('throws the API’s detail on a refusal', async () => {
    stubApi(
      { issues_owned: '' },
      { ok: false, status: 422, body: { detail: 'Issues owned: too many' } },
    )
    await expect(toggleOwned(ID, 1)).rejects.toThrow('Issues owned: too many')
  })
})

describe('setReadTo', () => {
  it('sends read_to only', async () => {
    const patches = stubApi({})
    await setReadTo(ID, 7)
    expect(patches).toEqual([{ read_to: 7 }])
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
