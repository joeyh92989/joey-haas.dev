import { describe, expect, it } from 'vitest'
import { listingLines } from './SellChecklistSheet.jsx'

const garment = { name: 'Pant', brand: 'Duer', material: null, notes: null }
const sizeOf = (g, size) => listingLines(g, size).find(([k]) => k === 'Size')[1]

describe('listingLines size', () => {
  it('reads the garment’s own size before the profile’s', () => {
    expect(sizeOf({ ...garment, size: '32 / 30' }, 'M')).toBe('32 / 30')
  })

  it('falls back to the profile’s size, then says it has none', () => {
    expect(sizeOf({ ...garment, size: null }, 'M')).toBe('M')
    expect(sizeOf({ ...garment, size: null }, null)).toBe('Not on the profile')
  })
})
