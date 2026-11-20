import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useJobRun } from './useJobRun.js'

const reply = (status, body = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useJobRun', () => {
  it('POSTs the path with its JSON body and credentials, then reads done', async () => {
    const fetch = vi.fn(async () => reply(200))
    vi.stubGlobal('fetch', fetch)
    const onSettled = vi.fn()
    const { result } = renderHook(() =>
      useJobRun({ path: '/api/x', body: { kind: 'radar' }, onSettled }),
    )
    expect(result.current.state).toBe('idle')
    await act(() => result.current.start())
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('/api/x')
    expect(options.method).toBe('POST')
    expect(options.credentials).toBe('include')
    expect(options.headers['Content-Type']).toBe('application/json')
    expect(options.body).toBe('{"kind":"radar"}')
    expect(result.current.state).toBe('done')
    expect(typeof result.current.at).toBe('number')
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('sends no body or content type when there is none', async () => {
    const fetch = vi.fn(async () => reply(200))
    vi.stubGlobal('fetch', fetch)
    const { result } = renderHook(() => useJobRun({ path: '/api/y?budget=10' }))
    await act(() => result.current.start())
    const [, options] = fetch.mock.calls[0]
    expect(options.body).toBeUndefined()
    expect(options.headers).toBeUndefined()
  })

  it('reads running while the call is open and never fires twice', async () => {
    let finish
    const fetch = vi.fn(
      () => new Promise((resolve) => (finish = () => resolve(reply(200)))),
    )
    vi.stubGlobal('fetch', fetch)
    const { result } = renderHook(() => useJobRun({ path: '/api/x' }))
    act(() => {
      result.current.start()
      result.current.start()
    })
    expect(result.current.state).toBe('running')
    act(() => {
      result.current.start()
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => finish())
    await waitFor(() => expect(result.current.state).toBe('done'))
  })

  it('reads a 409 as already running and still refetches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reply(409, { detail: 'locked' })),
    )
    const onSettled = vi.fn()
    const { result } = renderHook(() =>
      useJobRun({ path: '/api/x', onSettled }),
    )
    await act(() => result.current.start())
    expect(result.current.state).toBe('failed')
    expect(result.current.error).toBe('Already running')
    expect(onSettled).toHaveBeenCalled()
  })

  it('reads the API detail on another failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reply(502, { detail: 'IGDB is not configured' })),
    )
    const { result } = renderHook(() => useJobRun({ path: '/api/x' }))
    await act(() => result.current.start())
    expect(result.current.state).toBe('failed')
    expect(result.current.error).toBe('IGDB is not configured')
  })

  it('reads a network error in words, and can run again after', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(reply(200))
    vi.stubGlobal('fetch', fetch)
    const { result } = renderHook(() => useJobRun({ path: '/api/x' }))
    await act(() => result.current.start())
    expect(result.current.error).toBe(
      'Couldn’t reach the server. Try again in a minute.',
    )
    await act(() => result.current.start())
    expect(result.current.state).toBe('done')
    expect(result.current.error).toBe(null)
  })

  it('aborts on unmount and updates and refetches nothing after', async () => {
    let signal
    let rejectCall
    vi.stubGlobal(
      'fetch',
      vi.fn((url, options) => {
        signal = options.signal
        return new Promise((resolve, reject) => (rejectCall = reject))
      }),
    )
    const onSettled = vi.fn()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result, unmount } = renderHook(() =>
      useJobRun({ path: '/api/x', onSettled }),
    )
    act(() => {
      result.current.start()
    })
    unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => rejectCall(new DOMException('x', 'AbortError')))
    expect(onSettled).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })
})
