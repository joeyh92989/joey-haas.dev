import { describe, expect, it } from 'vitest'
import { normalize } from './normalize.js'

describe('normalize', () => {
  it.each([
    ['Pokémon', 'pokemon'],
    ['Spider-Man: No Way Home', 'spider man no way home'],
    ['Mario Kart²', 'mario kart2'],
    ['  The   Legend of Zelda™  ', 'the legend of zeldatm'],
    ['Game-Key Card', 'game key card'],
    ['“Quoted” — dashes…', 'quoted dashes'],
    ['', ''],
  ])('%s → %s', (input, expected) => {
    expect(normalize(input)).toBe(expected)
  })

  it('treats null and undefined as empty', () => {
    expect(normalize(null)).toBe('')
    expect(normalize(undefined)).toBe('')
  })
})
