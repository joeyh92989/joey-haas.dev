import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSnapshot } from './snapshot.js'
import { useSnapshotThenLive } from './useSnapshotThenLive.js'

// Records every call to a useState setter, so a test can prove the hook sets
// no state once it is unmounted (React 19 no longer warns about that).
const setterCalls = vi.hoisted(() => vi.fn())

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useState: (initial) => {
      const [value, set] = actual.useState(initial)
      return [
        value,
        (next) => {
          setterCalls()
          set(next)
        },
      ]
    },
  }
})

vi.mock('./snapshot.js', async (importOriginal) => ({
  ...(await importOriginal()),
  readSnapshot: vi.fn(),
}))

const BODY = { tonight: { up_next: null, picks: [] }, buy_now: [] }

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useSnapshotThenLive', () => {
  it('paints the snapshot, then live data replaces it', async () => {
    vi.mocked(readSnapshot).mockResolvedValue({
      ...BODY,
      buy_now: [{ title: 'Old' }],
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => BODY }),
    )
    const { result } = renderHook(() => useSnapshotThenLive('next'))
    await waitFor(() => expect(result.current.live).toBe(true))
    expect(result.current.data.buy_now).toEqual([])
  })

  it('keeps a painted snapshot when the API fails', async () => {
    vi.mocked(readSnapshot).mockResolvedValue(BODY)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    const { result } = renderHook(() => useSnapshotThenLive('next'))
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.data).toEqual(BODY)
  })

  it('ignores a live body of the wrong shape', async () => {
    vi.mocked(readSnapshot).mockResolvedValue(null)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] }),
    )
    const { result } = renderHook(() => useSnapshotThenLive('next'))
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.data).toBeNull()
  })

  it('does not let a late snapshot overwrite live data', async () => {
    let resolveSnapshot
    vi.mocked(readSnapshot).mockReturnValue(
      new Promise((resolve) => {
        resolveSnapshot = resolve
      }),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => BODY }),
    )
    const { result } = renderHook(() => useSnapshotThenLive('next'))
    await waitFor(() => expect(result.current.live).toBe(true))
    resolveSnapshot({ ...BODY, buy_now: [{ title: 'Old' }] })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(result.current.data.buy_now).toEqual([])
  })

  it('sets no state after unmount', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    let resolveFetch
    vi.mocked(readSnapshot).mockResolvedValue(BODY)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
      ),
    )
    const { unmount } = renderHook(() => useSnapshotThenLive('next'))
    unmount()
    setterCalls.mockClear()
    resolveFetch({ ok: true, json: async () => BODY })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(setterCalls).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
  })

  it('sets no state after unmount when the API fails', async () => {
    let rejectFetch
    vi.mocked(readSnapshot).mockResolvedValue(BODY)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise((_, reject) => {
          rejectFetch = reject
        }),
      ),
    )
    const { unmount } = renderHook(() => useSnapshotThenLive('next'))
    unmount()
    setterCalls.mockClear()
    rejectFetch(new Error('down'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(setterCalls).not.toHaveBeenCalled()
  })

  it('forgets the previous name when the name changes', async () => {
    vi.mocked(readSnapshot).mockResolvedValue(null)
    vi.stubGlobal(
      'fetch',
      vi.fn((url) =>
        url.includes('/api/public/next')
          ? Promise.resolve({ ok: true, json: async () => BODY })
          : new Promise(() => {}),
      ),
    )
    const { result, rerender } = renderHook(
      ({ name }) => useSnapshotThenLive(name),
      { initialProps: { name: 'next' } },
    )
    await waitFor(() => expect(result.current.live).toBe(true))
    rerender({ name: 'stats' })
    expect(result.current).toEqual({ data: null, live: false, failed: false })
  })
})
