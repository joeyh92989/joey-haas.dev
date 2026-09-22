import { describe, expect, it } from 'vitest'
import { localToday, statusTransition } from './statusTransition.js'

const TODAY = '2026-09-22'

describe('statusTransition', () => {
  it('records a first finish as one completion today', () => {
    const item = { status: 'backlog', finished_at: null, times_completed: 0 }
    expect(statusTransition(item, 'finished', TODAY)).toEqual({
      status: 'finished',
      finished_at: TODAY,
      times_completed: 1,
    })
  })

  // A replay arrives as active -> finished; only the history can tell it
  // from a first finish.
  it('counts a replay after a revert, keeping the first finish date', () => {
    const item = {
      status: 'active',
      finished_at: '2025-04-01',
      times_completed: 1,
    }
    expect(statusTransition(item, 'finished', TODAY)).toEqual({
      status: 'finished',
      finished_at: '2025-04-01',
      times_completed: 2,
    })
  })

  it('counts a finish with completions but no date, dating it today', () => {
    const item = { status: 'active', finished_at: null, times_completed: 3 }
    expect(statusTransition(item, 'finished', TODAY)).toEqual({
      status: 'finished',
      finished_at: TODAY,
      times_completed: 4,
    })
  })

  it('treats a finish date with no count as a prior finish', () => {
    const item = {
      status: 'active',
      finished_at: '2025-04-01',
      times_completed: 0,
    }
    expect(statusTransition(item, 'finished', TODAY).times_completed).toBe(1)
  })

  it.each(['backlog', 'active', 'abandoned'])(
    'sends only the status for %s',
    (next) => {
      const item = {
        status: 'finished',
        finished_at: TODAY,
        times_completed: 1,
      }
      expect(statusTransition(item, next, TODAY)).toEqual({ status: next })
    },
  )

  it('never mutates the item', () => {
    const item = { status: 'backlog', finished_at: null, times_completed: 0 }
    const before = { ...item }
    statusTransition(item, 'finished', TODAY)
    expect(item).toEqual(before)
  })
})

describe('localToday', () => {
  // The column is a date, and "today" is the owner's day, not UTC's: at 11pm
  // in Denver, UTC is already tomorrow.
  it('formats the local calendar date', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })
})
