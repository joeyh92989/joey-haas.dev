import { afterEach, describe, expect, it, vi } from 'vitest'
import { removeEntry } from './intakeRemove.js'

afterEach(() => vi.unstubAllGlobals())

const response = (status, body = null) => ({
  ok: status < 400,
  status,
  json: async () => body,
})

describe('removeEntry', () => {
  it('sends one PATCH for a double click', async () => {
    let finish
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(response(200, { id: 'e1', state: 'ignored' }))
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const onEntry = vi.fn()
    const handlers = { onEntry, onError: vi.fn() }
    const entry = { id: 'e1', payload: {} }
    const first = removeEntry(entry, handlers)
    await removeEntry(entry, handlers)
    finish()
    await first
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onEntry).toHaveBeenCalledTimes(1)
  })

  it('reports a refusal in the API’s words and allows a retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(409, { detail: 'Sitting is gone' }))
      .mockResolvedValueOnce(response(200, { id: 'e2', state: 'ignored' }))
    vi.stubGlobal('fetch', fetchMock)
    const onError = vi.fn()
    const onEntry = vi.fn()
    const entry = { id: 'e2', payload: {} }
    await removeEntry(entry, { onEntry, onError })
    expect(onError).toHaveBeenLastCalledWith('Sitting is gone')
    expect(onEntry).not.toHaveBeenCalled()
    await removeEntry(entry, { onEntry, onError })
    expect(onEntry).toHaveBeenCalledTimes(1)
  })

  it('deletes a typed closet piece through its garment', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(204))
    vi.stubGlobal('fetch', fetchMock)
    const onEntry = vi.fn()
    await removeEntry(
      {
        id: 'e3',
        garment_id: 'g9',
        photo_id: null,
        state: 'typed',
        payload: {},
      },
      { onEntry, onError: vi.fn() },
    )
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/closet\/garments\/g9$/)
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
    expect(onEntry.mock.calls[0][0].state).toBe('ignored')
  })
})
