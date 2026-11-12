import { describe, expect, it } from 'vitest'
import { pageName, titleLookup } from './pageTitles.js'

const ID = '0b7c6f3e-1111-4c1c-9a50-000000000001'
const titles = titleLookup([
  { g: 'shelf', title: 'Hades', href: `/shelf/${ID}/` },
  {
    g: 'comics',
    title: 'Saga',
    href: '/shelf/0b7c6f3e-2222-4c1c-9a50-000000000002/',
  },
  { g: 'posts', title: 'A post', href: '/blog/a-post' },
])

describe('pageName', () => {
  it('names an item by its title, matching the slash-less server path', () => {
    expect(pageName(titles, `/shelf/${ID}`)).toBe('Hades')
  })

  it('names year and month pages like the pages themselves', () => {
    expect(pageName(null, '/shelf/year/2026')).toBe('2026 in review')
    expect(pageName(null, '/shelf/journal/2026-10')).toBe(
      'October 2026 · My Shelf',
    )
  })

  it('names a comic issue and edition after the series', () => {
    const saga = '0b7c6f3e-2222-4c1c-9a50-000000000002'
    expect(pageName(titles, `/shelf/${saga}/12`)).toBe('Saga · issue 12')
    expect(pageName(titles, `/shelf/${saga}/ed-1-6`)).toBe(
      'Saga · collected edition',
    )
  })

  it('falls back to the path: no index, unknown item, other groups', () => {
    expect(pageName(null, `/shelf/${ID}`)).toBe(`/shelf/${ID}`)
    expect(
      pageName(titles, '/shelf/0b7c6f3e-9999-4c1c-9a50-000000000009'),
    ).toBe('/shelf/0b7c6f3e-9999-4c1c-9a50-000000000009')
    expect(pageName(titles, '/blog/a-post')).toBe('/blog/a-post')
    expect(pageName(titles, '/about')).toBe('/about')
  })
})
