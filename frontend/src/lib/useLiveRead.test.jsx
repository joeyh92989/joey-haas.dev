import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { READ_DEADLINE_MS } from './waits.js'
import { useLiveRead } from './useLiveRead.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const ok = (body) => ({ ok: true, json: async () => body })

describe('useLiveRead', () => {
  it('reads a path', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ a: 1 })))
    const { result } = renderHook(() => useLiveRead('/api/public/x'))
    await waitFor(() => expect(result.current.live).toBe(true))
    expect(result.current.data).toEqual({ a: 1 })
    expect(result.current.failed).toBe(false)
  })

  it('fails on a non-OK answer, and retry re-runs and succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce(ok({ a: 2 }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useLiveRead('/api/public/x'))
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.data).toBeNull()
    act(() => {
      result.current.retry()
    })
    expect(result.current.failed).toBe(false)
    await waitFor(() => expect(result.current.data).toEqual({ a: 2 }))
    expect(result.current.failed).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retry resolves once the re-read has landed, or failed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce(ok({ a: 2 }))
      .mockResolvedValueOnce({ ok: false, status: 503 })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useLiveRead('/api/public/x'))
    await waitFor(() => expect(result.current.failed).toBe(true))
    let landed
    act(() => {
      landed = result.current.retry()
    })
    let settled = false
    landed.then(() => {
      settled = true
    })
    expect(settled).toBe(false)
    await expect(landed).resolves.toEqual({ failed: false })
    await waitFor(() => expect(result.current.data).toEqual({ a: 2 }))

    let again
    act(() => {
      again = result.current.retry()
    })
    await expect(again).resolves.toEqual({ failed: true })
    // The data already shown stays, marked failed.
    expect(result.current.data).toEqual({ a: 2 })
    await waitFor(() => expect(result.current.failed).toBe(true))
  })

  it('accepts a function and reruns it when deps change', async () => {
    const read = vi.fn(async () => 'v')
    const { result, rerender } = renderHook(
      ({ id }) => useLiveRead(read, [id]),
      { initialProps: { id: 1 } },
    )
    await waitFor(() => expect(result.current.data).toBe('v'))
    rerender({ id: 2 })
    expect(result.current.data).toBeNull()
    await waitFor(() => expect(result.current.data).toBe('v'))
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('fails at the deadline when the read hangs', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    const { result } = renderHook(() => useLiveRead('/api/public/x'))
    expect(result.current.failed).toBe(false)
    await act(() => vi.advanceTimersByTimeAsync(READ_DEADLINE_MS + 1))
    expect(result.current.failed).toBe(true)
  })

  it('aborts the request on unmount', async () => {
    let signal
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, options) => {
        signal = options.signal
        return new Promise(() => {})
      }),
    )
    const { unmount } = renderHook(() => useLiveRead('/api/public/x'))
    await waitFor(() => expect(signal).toBeDefined())
    expect(signal.aborted).toBe(false)
    unmount()
    expect(signal.aborted).toBe(true)
  })
})
