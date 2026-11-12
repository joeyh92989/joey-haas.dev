import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useElapsed } from './useElapsed.js'

describe('useElapsed', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('is 0 while inactive', () => {
    const { result } = renderHook(() => useElapsed(false))
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current).toBe(0)
  })

  it('counts whole seconds once active', () => {
    const { result } = renderHook(() => useElapsed(true))
    expect(result.current).toBe(0)
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(1)
    act(() => vi.advanceTimersByTime(2500))
    expect(result.current).toBe(3)
  })

  it('resets to 0 when it goes inactive and restarts on the next activation', () => {
    const { result, rerender } = renderHook(({ on }) => useElapsed(on), {
      initialProps: { on: true },
    })
    act(() => vi.advanceTimersByTime(4000))
    expect(result.current).toBe(4)
    rerender({ on: false })
    expect(result.current).toBe(0)
    rerender({ on: true })
    act(() => vi.advanceTimersByTime(2000))
    expect(result.current).toBe(2)
  })

  it('stops ticking on unmount', () => {
    const { unmount } = renderHook(() => useElapsed(true))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
