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
const content = vi.hoisted(() => ({ posts: [], notes: [] }))
vi.mock('./content/posts.js', () => ({
  posts: content.posts,
  findPost: (slug) => content.posts.find((post) => post.slug === slug),
}))
vi.mock('./content/notes.js', () => ({
  notes: content.notes,
  findNote: (slug) => content.notes.find((note) => note.slug === slug),
}))
vi.mock('./content/trips.js', () => ({
  trips: [],
  findTrip: () => undefined,
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
  // Signed in, so the admin routes get past AdminLayout's session check;
  // nothing else answers, so every API-backed page stays in its loading
  // state.
  vi.stubGlobal(
    'fetch',
    vi.fn((url) =>
      String(url).endsWith('/api/auth/me')
        ? Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ email: 'admin@example.com' }),
          })
        : new Promise(() => {}),
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  content.posts.length = 0
})

describe('App redirects', () => {
  it('lands /admin/import on Shelf’s Add page (AC 15)', async () => {
    renderAt('/admin/import')
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        /^\/admin\/collection\/add$/,
      ),
    )
  })

  // Each pre-rename URL lands on its /shelf page in one hop.
  it.each([
    ['/spine', /^\/shelf$/],
    ['/spine/next', /^\/shelf\/next$/],
    ['/spine/how', /^\/shelf\/how$/],
    ['/spine/year', new RegExp(`^/shelf/year/${new Date().getFullYear()}/$`)],
    ['/spine/year/2025', /^\/shelf\/year\/2025\/$/],
    ['/spine/journal/2026-10', /^\/shelf\/journal\/2026-10\/$/],
    ['/spine/42', /^\/shelf\/42\/$/],
    ['/spine/42/', /^\/shelf\/42\/$/],
    ['/collection', /^\/shelf$/],
    ['/collection/42', /^\/shelf\/42\/$/],
  ])('sends %s to its /shelf page', async (from, to) => {
    renderAt(from)
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(to),
    )
  })
})

/** [path, title]; each later task adds its routes' rows. */
const TITLES = [
  ['/', 'Joey Haas · Senior software engineer, Denver'],
  ['/about', 'About · Joey Haas'],
  ['/projects', 'Projects · Joey Haas'],
  ['/now', 'Now · Joey Haas'],
  ['/colophon', 'Colophon · Joey Haas'],
  ['/stats', 'Stats · Joey Haas'],
  ['/denver', 'Denver, the short list · Joey Haas'],
  ['/daily', 'Daily · My Shelf'],
  ['/blog', 'Blog · Joey Haas'],
  ['/shelf', 'My Shelf · Joey Haas'],
  ['/nonsense-path', 'Not found · Joey Haas'],
  ['/blog/no-such-post', 'Not found · Joey Haas'],
  ['/til', 'TIL · Joey Haas'],
  ['/til/not-a-note', 'Not found · Joey Haas'],
  ['/travel', 'Travel · Joey Haas'],
  ['/travel/not-a-trip', 'Not found · Joey Haas'],
  ['/admin', 'Home · Admin · Joey Haas'],
  ['/admin/analytics', 'Analytics · Admin · Joey Haas'],
  ['/admin/jobs', 'Jobs · Admin · Joey Haas'],
  ['/admin/collection', 'Shelf · Admin · Joey Haas'],
  // `add` outranks `:id`: the Add page, not an item called "add".
  ['/admin/collection/add', 'Add · Admin · Joey Haas'],
  ['/admin/collection/add/abc', 'Sitting · Admin · Joey Haas'],
  ['/admin/closet/add', 'Add · Admin · Joey Haas'],
  ['/admin/closet/add/abc', 'Sitting · Admin · Joey Haas'],
  ['/admin/play-next', 'Play Next · Admin · Joey Haas'],
  ['/admin/catalogue', 'Sources · Admin · Joey Haas'],
  ['/admin/radar', 'Radar · Admin · Joey Haas'],
  ['/admin/pull-list', 'Pull list · Admin · Joey Haas'],
  ['/admin/discover', 'Discover · Admin · Joey Haas'],
  ['/admin/store-list', 'Store list · Admin · Joey Haas'],
  ['/admin/spots', 'Spots · Admin · Joey Haas'],
  ['/admin/weekend', 'This weekend · Admin · Joey Haas'],
  ['/admin/collection/42', 'Item · Admin · Joey Haas'],
  ['/admin/closet', 'Closet · Admin · Joey Haas'],
  ['/admin/closet/today', 'Today · Admin · Joey Haas'],
  ['/admin/closet/review', 'Review · Admin · Joey Haas'],
  ['/admin/closet/profile', 'Profile · Admin · Joey Haas'],
  ['/admin/closet/7', 'Garment · Admin · Joey Haas'],
  ['/admin/no-such-page', 'Not found · Joey Haas'],
  ['/shelf/42', 'My Shelf · Joey Haas'],
  ['/shelf/42/58/', 'My Shelf · Joey Haas'],
  ['/shelf/comics', 'Comics · My Shelf'],
  ['/shelf/intake', 'Try the intake · My Shelf'],
  ['/shelf/next', 'What’s next · My Shelf'],
  ['/shelf/how', 'How it works · My Shelf'],
  ['/shelf/year/2025', '2025 in review · My Shelf'],
  ['/shelf/journal/2026-10', 'October 2026 · My Shelf'],
  // Redirects to this calendar year's page.
  ['/shelf/year', `${new Date().getFullYear()} in review · My Shelf`],
  // The pre-rename form, which goes straight to the same page.
  ['/spine/year', `${new Date().getFullYear()} in review · My Shelf`],
]

describe('App page titles', () => {
  beforeEach(() => {
    document.title = 'Stale'
  })

  it.each(TITLES)('titles %s', async (path, title) => {
    renderAt(path)
    // Admin pages are lazy chunks: on a busy machine the dynamic import can
    // outlast waitFor's default second, which is a slow test, not a bug.
    await waitFor(() => expect(document.title).toBe(title), { timeout: 4000 })
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

  // /shelf/:id/:part serves only a canonical issue number; the edition
  // slug is NotFound until its page exists.
  it.each(['abc', '058', '0', '12345', '5x', 'ed-1-6'])(
    'sends /shelf/42/%s/ to NotFound',
    async (part) => {
      renderAt(`/shelf/42/${part}/`)
      await waitFor(() => expect(document.title).toBe('Not found · Joey Haas'))
    },
  )

  // A route added to App.jsx without a row here fails this test. Layout
  // routes (the ones with children) and the two /collection redirects set
  // no title, so they are not counted.
  it('covers every titled route', () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), 'App.jsx'),
      'utf8',
    )
    const routes = source
      .split('\n')
      .filter((line) => /<Route (?:path=|index)/.test(line))
      .filter((line) => !/\}>\s*$/.test(line))
      .filter((line) => !/Navigate|Redirect/.test(line))
    expect(TITLES).toHaveLength(routes.length)
  })
})
