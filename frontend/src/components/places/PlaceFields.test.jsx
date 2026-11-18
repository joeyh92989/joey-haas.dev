import { describe, expect, it } from 'vitest'
import {
  cityLabel,
  effectiveCity,
  emptyFields,
  fieldsPayload,
} from './PlaceFields.jsx'

describe('place fields', () => {
  it('start in Denver, private, with nothing chosen', () => {
    expect(fieldsPayload(emptyFields())).toEqual({
      city: 'denver',
      tags: [],
      blurb: null,
      is_public: false,
    })
  })

  it('send the typed city lower case, tags in vocabulary order, blurb trimmed', () => {
    const values = {
      city: 'other',
      otherCity: ' Fort Collins ',
      tags: ['park', 'coffee'],
      blurb: ' Nice ',
      isPublic: true,
    }
    expect(effectiveCity(values)).toBe('fort collins')
    expect(fieldsPayload(values)).toEqual({
      city: 'fort collins',
      tags: ['coffee', 'park'],
      blurb: 'Nice',
      is_public: false,
    })
  })

  it('reads a blank other city as Denver and labels cities in words', () => {
    expect(effectiveCity({ ...emptyFields(), city: 'other' })).toBe('denver')
    expect(cityLabel('fort collins')).toBe('Fort Collins')
  })
})
