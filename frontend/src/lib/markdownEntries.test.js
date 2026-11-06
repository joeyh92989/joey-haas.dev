import { describe, expect, it } from 'vitest'
import { findEntry, publishedEntries } from './markdownEntries.js'

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

describe('findEntry', () => {
  const entries = publishedEntries({
    './a.md': entry('a-note', '2026-11-06'),
    './b.md': { default: null },
  })

  it('finds a published entry by slug', () => {
    expect(findEntry(entries, 'a-note')?.slug).toBe('a-note')
  })

  it('finds nothing for a missing slug or a draft', () => {
    expect(findEntry(entries, 'nope')).toBeUndefined()
    expect(findEntry([], 'a-note')).toBeUndefined()
  })
})
