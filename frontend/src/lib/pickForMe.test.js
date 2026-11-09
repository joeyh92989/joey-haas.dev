import { describe, expect, it } from 'vitest'
import KEYS from './pick-for-me-keys.json'
import {
  MAX_MOODS,
  PICK_MOODS,
  PICK_SIZES,
  pickForMeKey,
  picksFor,
  toggleMood,
} from './pickForMe.js'

/** Every key the band can ask for, the way the band builds it. */
function bandKeys() {
  const keys = []
  for (const size of PICK_SIZES) {
    keys.push(pickForMeKey(size, []))
    PICK_MOODS.forEach((a, i) => {
      keys.push(pickForMeKey(size, [a]))
      PICK_MOODS.slice(i + 1).forEach((b) =>
        keys.push(pickForMeKey(size, [b, a])),
      )
    })
  }
  return keys
}

describe('pickForMeKey', () => {
  it('builds exactly the keys backend/picker.py precomputes', () => {
    expect(new Set(bandKeys())).toEqual(new Set(KEYS))
    expect(KEYS).toHaveLength(88)
  })

  it('sorts moods, so press order never changes the key', () => {
    expect(pickForMeKey('short', ['story', 'cozy'])).toBe('short|cozy+story')
    expect(pickForMeKey('any', [])).toBe('any|')
  })
})

describe('toggleMood', () => {
  it('presses, unpresses and refuses a mood past the cap', () => {
    expect(MAX_MOODS).toBe(2)
    expect(toggleMood([], 'cozy')).toEqual({ moods: ['cozy'], refused: false })
    expect(toggleMood(['cozy'], 'cozy')).toEqual({ moods: [], refused: false })
    const full = ['cozy', 'story']
    expect(toggleMood(full, 'action')).toEqual({ moods: full, refused: true })
  })
})

describe('picksFor', () => {
  it('joins picks to cards and drops a pick without one', () => {
    const table = {
      games: { a: { item_id: 'a', title: 'A' } },
      combos: { 'any|': [{ item_id: 'a' }, { item_id: 'gone' }] },
    }
    expect(picksFor(table, 'any|')).toEqual([
      { pick: { item_id: 'a' }, card: { item_id: 'a', title: 'A' } },
    ])
    expect(picksFor(table, 'long|cozy')).toEqual([])
  })
})
