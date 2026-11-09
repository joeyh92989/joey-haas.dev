import { describe, expect, it } from 'vitest'
import { bodyFrom, formFrom } from './GarmentForm.jsx'

const garment = {
  name: 'Navy oxford',
  category: 'top',
  subtype: null,
  brand: 'Uniqlo',
  primary_color: 'navy',
  primary_hex: '#1f2a44',
  secondary_color: null,
  secondary_hex: null,
  pattern: null,
  material: 'cotton',
  warmth: 2,
  formality: 3,
  seasons: [3, 4, 5],
  notes: null,
  acquired_on: null,
  status: 'untagged',
  back_on: null,
}

describe('GarmentForm state', () => {
  it('saves an untagged garment as active, blanks as null', () => {
    const body = bodyFrom({ ...formFrom(garment), notes: '  ' })
    expect(body).toMatchObject({
      name: 'Navy oxford',
      brand: 'Uniqlo',
      subtype: null,
      notes: null,
      acquired_on: null,
      status: 'active',
      back_on: null,
      seasons: [3, 4, 5],
    })
  })

  it('sends back_on as the first of its month, and only while packed', () => {
    const packed = formFrom({
      ...garment,
      status: 'packed',
      back_on: '2027-05-01',
    })
    expect(packed.back_on).toBe('2027-05')
    expect(bodyFrom(packed).back_on).toBe('2027-05-01')
    expect(bodyFrom({ ...packed, status: 'active' }).back_on).toBeNull()
  })
})
