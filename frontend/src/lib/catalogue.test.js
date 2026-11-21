import { describe, expect, it } from 'vitest'
import { catalogueNumbers } from './catalogue.js'

const row = (id, created_at) => ({ id, created_at })

describe('catalogueNumbers', () => {
  it('numbers the whole shelf oldest first, from 1', () => {
    const numbers = catalogueNumbers([
      row('c', '2026-03-01T00:00:00Z'),
      row('a', '2026-01-01T00:00:00Z'),
      row('b', '2026-02-01T00:00:00Z'),
    ])
    expect(numbers.get('a')).toBe(1)
    expect(numbers.get('b')).toBe(2)
    expect(numbers.get('c')).toBe(3)
  })

  it('does not depend on the order the rows arrive in', () => {
    const rows = [row('x', '2026-01-02'), row('y', '2026-01-01')]
    const forward = catalogueNumbers(rows)
    const backward = catalogueNumbers([...rows].reverse())
    expect(forward.get('y')).toBe(1)
    expect(backward.get('y')).toBe(1)
    expect(forward.get('x')).toBe(backward.get('x'))
  })

  it('falls back to the id when a row has no created_at, and breaks ties by id', () => {
    const numbers = catalogueNumbers([
      row('b'),
      row('a'),
      row('c', '2026-01-01'),
    ])
    expect(numbers.get('c')).toBe(1)
    expect(numbers.get('a')).toBe(2)
    expect(numbers.get('b')).toBe(3)
  })

  it('reads another id field when told to', () => {
    const numbers = catalogueNumbers(
      [{ item_id: 'q' }, { item_id: 'p' }],
      (r) => r.item_id,
    )
    expect(numbers.get('p')).toBe(1)
  })
})
