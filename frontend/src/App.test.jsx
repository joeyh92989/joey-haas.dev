import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'

// posts.js globs markdown the Vitest config cannot compile, so it is
// replaced. Tests push onto this array to publish a post.
const content = vi.hoisted(() => ({ posts: [] }))
vi.mock('./content/posts.js', () => ({
  posts: content.posts,
  findPost: (slug) => content.posts.find((post) => post.slug === slug),
  formatDate: (date) => date,
}))
vi.mock('./lib/snapshot.js', () => ({ readSnapshot: vi.fn(async () => null) }))
vi.mock('./lib/useMediaQuery.js', () => ({ useMediaQuery: () => false }))

/** Prints the router's current path, so a redirect can be observed. */
function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Location />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  // Never answers: every API-backed page stays in its loading state.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  content.posts.length = 0
})

describe('App redirects', () => {
  it('sends /collection to /spine', async () => {
    renderAt('/collection')
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/spine$/),
    )
  })

  it('carries the id from /collection/:id to /spine/:id', async () => {
    renderAt('/collection/42')
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/spine\/42$/),
    )
  })
})

/** [path, title]; each later task adds its routes' rows. */
const TITLES = [
  ['/', 'Joey Haas — Senior software engineer, Denver'],
  ['/about', 'About · Joey Haas'],
  ['/projects', 'Projects · Joey Haas'],
  ['/blog', 'Blog · Joey Haas'],
  ['/spine', 'Spine · Joey Haas'],
  ['/nonsense-path', 'Not found · Joey Haas'],
  ['/blog/no-such-post', 'Not found · Joey Haas'],
  ['/admin', 'Admin · Joey Haas'],
  ['/admin/collection', 'Collection · Admin'],
  ['/admin/import', 'Import from photos · Admin'],
  ['/admin/play-next', 'Play Next · Admin'],
  ['/admin/catalogue', 'Catalogue · Admin'],
  ['/admin/radar', 'Radar · Admin'],
  ['/admin/discover', 'Discover · Admin'],
  ['/admin/collection/42', 'Item · Admin'],
  ['/spine/42', 'Spine · Joey Haas'],
]

describe('App page titles', () => {
  beforeEach(() => {
    document.title = 'Stale'
  })

  it.each(TITLES)('titles %s', async (path, title) => {
    renderAt(path)
    await waitFor(() => expect(document.title).toBe(title))
  })

  it('titles a post by its own title', async () => {
    content.posts.push({
      slug: 'how-spine-works',
      html: '<p>Body</p>',
      frontmatter: { title: 'How Spine works', date: '2026-10-02', tags: [] },
    })
    renderAt('/blog/how-spine-works')
    await waitFor(() =>
      expect(document.title).toBe('How Spine works · Joey Haas'),
    )
  })

  // A route added to App.jsx without a row here fails this test. The two
  // /collection redirects set no title, so they are not counted.
  it('covers every titled route', () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), 'App.jsx'),
      'utf8',
    )
    const routes = source.match(/<Route (?:path=|index)/g) ?? []
    const redirects = source.match(/<Route path="collection/g) ?? []
    expect(TITLES).toHaveLength(routes.length - redirects.length)
  })
})
