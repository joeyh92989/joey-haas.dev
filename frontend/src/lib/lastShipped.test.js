import { describe, expect, it } from 'vitest'
import { LAST_SHIPPED_LIMIT, lastShippedText } from './lastShipped.js'

describe('lastShippedText', () => {
  it('is null without an entry', () => {
    expect(lastShippedText(undefined)).toBeNull()
  })

  it('keeps a short bullet whole, links as their text', () => {
    expect(lastShippedText({ lines: ['See [Stats](/stats) now.'] })).toBe(
      'See Stats now.',
    )
  })

  it('cuts a long bullet at a word with an ellipsis', () => {
    const text = lastShippedText({
      lines: [
        'One two three four five six seven eight nine ten eleven twelve.',
      ],
    })
    expect(text.length).toBeLessThanOrEqual(LAST_SHIPPED_LIMIT)
    expect(text.endsWith('…')).toBe(true)
    expect(
      text
        .slice(0, -1)
        .split(' ')
        .every((w) => /^[A-Za-z]+$/.test(w)),
    ).toBe(true)
  })
})
