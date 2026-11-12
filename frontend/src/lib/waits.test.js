import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SLOW_LOAD_AFTER_S,
  STILL_PLANNING_AFTER_S,
  STILL_WORKING_AFTER_S,
  WAIT_DEADLINE_MS,
  WaitTimeout,
  withDeadline,
} from './waits.js'

describe('withDeadline', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('uses a 195 s deadline', () => {
    expect(WAIT_DEADLINE_MS).toBe(195_000)
  })

  it('exports the still-working points', () => {
    expect(STILL_WORKING_AFTER_S).toBe(30)
    expect(STILL_PLANNING_AFTER_S).toBe(20)
    expect(SLOW_LOAD_AFTER_S).toBe(3)
  })

  it('rejects, and clears its timer, when the work throws synchronously', async () => {
    const boom = new Error('sync')
    await expect(
      withDeadline(() => {
        throw boom
      }),
    ).rejects.toBe(boom)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('resolves with the work and clears its timer', async () => {
    await expect(withDeadline(async () => 'done')).resolves.toBe('done')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts the signal and rejects with WaitTimeout at the deadline', async () => {
    let seen
    const run = withDeadline((signal) => {
      seen = signal
      return new Promise(() => {})
    })
    const outcome = run.catch((e) => e)
    await vi.advanceTimersByTimeAsync(WAIT_DEADLINE_MS - 1)
    expect(seen.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const error = await outcome
    expect(error).toBeInstanceOf(WaitTimeout)
    expect(seen.aborted).toBe(true)
  })

  it('passes other failures through untouched', async () => {
    const boom = new Error('boom')
    await expect(
      withDeadline(async () => {
        throw boom
      }),
    ).rejects.toBe(boom)
  })

  it('aborts the work when the caller aborts, without calling it a timeout', async () => {
    const outer = new AbortController()
    let seen
    const outcome = withDeadline(
      (signal) => {
        seen = signal
        return new Promise(() => {})
      },
      { signal: outer.signal },
    ).catch((e) => e)
    outer.abort()
    const error = await outcome
    expect(seen.aborted).toBe(true)
    expect(error).not.toBeInstanceOf(WaitTimeout)
    expect(error.name).toBe('AbortError')
    expect(vi.getTimerCount()).toBe(0)
  })
})
