import { describe, expect, it } from 'vitest'
import { SIZE_LABELS, sizeBand, sizeLabel } from './sizeBand.js'

describe('sizeBand', () => {
  // The same edges test_picker.py pins for backend/picker.py.
  it.each([
    [2, 0, 'Short'],
    [6, 0, 'Short'],
    [6.5, 1, 'Medium'],
    [15, 1, 'Medium'],
    [15.5, 2, 'Long'],
    [62, 2, 'Long'],
  ])('puts %s h in band %i, %s, as the picker does', (hours, band, label) => {
    expect(sizeBand(hours)).toBe(band)
    expect(sizeLabel(hours)).toBe(label)
    expect(SIZE_LABELS[band]).toBe(label)
  })

  it('has no band for unknown hours', () => {
    expect(sizeBand(null)).toBeNull()
    expect(sizeBand(undefined)).toBeNull()
    expect(sizeLabel(null)).toBeNull()
  })
})
