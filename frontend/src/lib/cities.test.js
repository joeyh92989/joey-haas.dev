import { describe, expect, it } from 'vitest'
import {
  cityCounts,
  cityKey,
  cityLabel,
  citiesFrom,
  FALLBACK_CITIES,
  HOME_CITY,
} from './cities.js'

const spots = [
  { city: 'denver' },
  { city: 'boulder' },
  { city: 'Boulder ' },
  { city: 'fort collins' },
  { city: 'denver' },
  { city: null },
]

describe('cities', () => {
  it('names the home city and the fallback list', () => {
    expect(HOME_CITY).toBe('denver')
    expect(FALLBACK_CITIES).toEqual(['boulder', 'golden', 'fort collins'])
  })

  it('keys a city like the server: trimmed, collapsed, lower case', () => {
    expect(cityKey('  Fort   COLLINS ')).toBe('fort collins')
    expect(cityKey(null)).toBe('')
  })

  it('lists the distinct non-Denver cities, sorted', () => {
    expect(citiesFrom(spots)).toEqual(['boulder', 'fort collins'])
    expect(citiesFrom([{ city: 'denver' }])).toEqual([])
    expect(citiesFrom(null)).toEqual([])
  })

  it('counts every city with Denver first', () => {
    expect(cityCounts(spots)).toEqual([
      { city: 'denver', count: 3 },
      { city: 'boulder', count: 2 },
      { city: 'fort collins', count: 1 },
    ])
    expect(cityCounts([{ city: 'boulder' }])).toEqual([
      { city: 'boulder', count: 1 },
    ])
  })

  it('labels a key, multi-word and non-ASCII included', () => {
    expect(cityLabel('denver')).toBe('Denver')
    expect(cityLabel('fort collins')).toBe('Fort Collins')
    expect(cityLabel('éclair falls')).toBe('Éclair Falls')
    expect(cityLabel('wilkes-barre')).toBe('Wilkes-Barre')
    expect(cityLabel('são paulo')).toBe('São Paulo')
  })
})
