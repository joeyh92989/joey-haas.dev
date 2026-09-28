import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Home from './Home.jsx'

const content = vi.hoisted(() => ({ posts: [] }))
vi.mock('../content/posts.js', () => content)
vi.mock('../lib/snapshot.js', () => ({ readSnapshot: vi.fn(async () => null) }))

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  )
}

afterEach(() => {
  content.posts.length = 0
})

describe('Home', () => {
  it('links to the collection from its own card', () => {
    renderHome()
    expect(
      screen.getByRole('link', { name: /What I’m playing/ }),
    ).toHaveAttribute('href', '/collection')
  })

  it('keeps the About and Projects cards', () => {
    renderHome()
    expect(screen.getByRole('link', { name: /More about me/ })).toHaveAttribute(
      'href',
      '/about',
    )
    expect(screen.getByRole('link', { name: /See my work/ })).toHaveAttribute(
      'href',
      '/projects',
    )
  })

  it('has no Latest block while nothing is published', () => {
    renderHome()
    expect(screen.queryByText('Latest')).toBeNull()
  })

  it('links the newest post as Latest once one is published', () => {
    content.posts.push({
      slug: 'how-the-tracker-works',
      frontmatter: { title: 'How the tracker works', date: '2026-10-01' },
    })
    renderHome()
    expect(
      screen.getByRole('link', { name: /How the tracker works/ }),
    ).toHaveAttribute('href', '/blog/how-the-tracker-works')
  })
})
