import { describe, expect, it } from 'vitest'
import { publishedEntries } from './markdownEntries.js'

const entry = (slug, date) => ({ default: { slug, frontmatter: { date } } })

describe('publishedEntries', () => {
  it('drops drafts compiled to null and sorts newest first', () => {
    const entries = publishedEntries({
      './a.md': entry('older', '2026-10-01'),
      './b.md': { default: null },
      './c.md': entry('newer', '2026-11-06'),
    })
    expect(entries.map((e) => e.slug)).toEqual(['newer', 'older'])
  })
})
