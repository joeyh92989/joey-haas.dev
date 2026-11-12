import { describe, expect, it } from 'vitest'
import { LAST_SHIPPED_LIMIT, lastShippedText } from './lastShipped.js'

describe('lastShippedText', () => {
  it('is null without an entry', () => {
    expect(lastShippedText(undefined)).toBeNull()
  })

  it('names the page the first bullet links to', () => {
    expect(lastShippedText({ lines: ['See [Stats](/stats) now.'] }, [])).toBe(
      'Stats',
    )
  })

  it('uses the link text for a page with no row, and skips hidden or external links', () => {
    expect(
      lastShippedText(
        {
          lines: [
            '[Denver](/denver) and [docs](https://x.test) and [Year](/shelf/year/2026).',
          ],
        },
        ['/denver'],
      ),
    ).toBe('Year')
  })

  it('cuts plain text at a word', () => {
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
