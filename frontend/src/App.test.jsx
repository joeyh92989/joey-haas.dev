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
