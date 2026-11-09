import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  STORAGE_KEY,
  dayRecord,
  emptyState,
  readDaily,
  recordGuess,
  recordOutcome,
  statsFor,
  writeDaily,
} from './dailyStorage.js'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

function play(state, day, ids, won) {
  const guessed = ids.reduce((s, id) => recordGuess(s, day, id), state)
  return recordOutcome(guessed, day, won)
}

describe('readDaily and writeDaily', () => {
  it('round-trips through localStorage', () => {
    const state = play(emptyState(), 3, ['a', 'b'], true)
    writeDaily(state)
    expect(readDaily()).toEqual(state)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).lastDay).toBe(3)
  })

  it('starts fresh when storage is empty or holds garbage', () => {
    expect(readDaily()).toEqual(emptyState())
    localStorage.setItem(STORAGE_KEY, 'not json')
    expect(readDaily()).toEqual(emptyState())
    localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2]))
    expect(readDaily()).toEqual(emptyState())
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ streak: 'two' }))
    expect(readDaily()).toEqual(emptyState())
  })

  it('survives a throwing localStorage on read and write', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readDaily()).toEqual(emptyState())
    expect(() => writeDaily(emptyState())).not.toThrow()
  })
})

describe('recordGuess', () => {
  it('appends to the day and restores it on reload', () => {
    let state = recordGuess(emptyState(), 7, 'a')
    state = recordGuess(state, 7, 'b')
    writeDaily(state)
    expect(dayRecord(readDaily(), 7)).toEqual({
      guesses: ['a', 'b'],
      won: null,
    })
    expect(dayRecord(readDaily(), 8)).toEqual({ guesses: [], won: null })
  })

  it('does not mutate the previous state', () => {
    const before = emptyState()
    recordGuess(before, 1, 'a')
    expect(before.days).toEqual({})
  })
})

describe('recordOutcome', () => {
  it('extends the streak on consecutive solved days', () => {
    let state = play(emptyState(), 1, ['x', 'a'], true)
    state = play(state, 2, ['a'], true)
    state = play(state, 3, ['x', 'y', 'a'], true)
    expect(state.streak).toBe(3)
    expect(state.played).toBe(3)
    expect(state.guessesTotal).toBe(6)
    expect(statsFor(state)).toEqual({ streak: 3, played: 3, average: '2.0' })
  })

  it('starts over after a missed day', () => {
    let state = play(emptyState(), 1, ['a'], true)
    state = play(state, 3, ['a'], true)
    expect(state.streak).toBe(1)
    expect(state.played).toBe(2)
  })

  it('resets to zero on a loss and counts no guesses toward the average', () => {
    let state = play(emptyState(), 1, ['a'], true)
    state = play(state, 2, ['b', 'c', 'd', 'e', 'f', 'g'], false)
    expect(state.streak).toBe(0)
    expect(state.played).toBe(2)
    expect(state.guessesTotal).toBe(1)
    expect(statsFor(state)).toEqual({ streak: 0, played: 2, average: '1.0' })
    state = play(state, 3, ['a', 'b'], true)
    expect(state.streak).toBe(1)
    expect(statsFor(state).average).toBe('1.5')
  })

  it('records a day once', () => {
    const state = play(emptyState(), 1, ['a'], true)
    expect(recordOutcome(state, 1, false)).toBe(state)
  })

  it('has no stats before the first finished game, and no average without a win', () => {
    expect(statsFor(emptyState())).toBeNull()
    expect(statsFor(recordGuess(emptyState(), 1, 'a'))).toBeNull()
    const lost = play(emptyState(), 1, ['a', 'b', 'c', 'd', 'e', 'f'], false)
    expect(statsFor(lost)).toEqual({ streak: 0, played: 1, average: null })
  })
})
