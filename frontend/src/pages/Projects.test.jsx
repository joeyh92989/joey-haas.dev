import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import Projects from './Projects.jsx'

vi.mock('../lib/snapshot.js', () => ({
  readSnapshot: vi.fn(async () => [
    {
      id: '1',
      type: 'game',
      title: 'Hades',
      cover_url: 'https://images.igdb.com/hades.jpg',
      favorite: true,
      rating: 10,
    },
  ]),
}))

vi.mock('../content/projects.js', () => ({
  projects: [
    {
      name: 'Spine',
      tagline: 'A tracker for a physical game collection',
      description: 'A tracker.',
      highlights: ['Photo import.', 'Play Next.'],
      links: [
        { to: '/spine', label: 'Open Spine' },
        {
          href: 'https://github.com/joeyh92989/joey-haas.dev',
          label: 'Source',
        },
      ],
      tech: ['React'],
      to: '/spine',
      url: null,
      strip: 'favourites',
    },
    {
      name: 'This Website',
      description: 'This site.',
      tech: ['Vite'],
      url: 'https://github.com/joeyh92989/joey-haas.dev',
    },
  ],
}))

function renderProjects() {
  return render(
    <MemoryRouter>
      <Projects />
    </MemoryRouter>,
  )
}

describe('Projects', () => {
  it('gives a card with a strip its favourite covers', async () => {
    const { container } = renderProjects()
    const cards = container.querySelectorAll('.project-card')
    await waitFor(() =>
      expect(cards[0].querySelectorAll('.cover-strip img')).toHaveLength(1),
    )
    expect(cards[1].querySelector('.cover-strip')).toBeNull()
  })

  it('renders a tagline and highlights only where set', () => {
    const { container } = renderProjects()
    const cards = container.querySelectorAll('.project-card')
    expect(cards[0].querySelector('.project-tagline')).toHaveTextContent(
      'A tracker for a physical game collection',
    )
    expect(cards[0].querySelectorAll('.project-highlights li')).toHaveLength(2)
    expect(cards[1].querySelector('.project-tagline')).toBeNull()
    expect(cards[1].querySelector('.project-highlights')).toBeNull()
  })

  it('links in-site with the router and away with an anchor', () => {
    const { container } = renderProjects()
    expect(screen.getByRole('link', { name: /Open Spine/ })).toHaveAttribute(
      'href',
      '/spine',
    )
    // The decorative arrow stays out of the accessible name.
    expect(screen.getByRole('link', { name: 'Open Spine' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Source/ })).toHaveAttribute(
      'href',
      'https://github.com/joeyh92989/joey-haas.dev',
    )
    const cards = container.querySelectorAll('.project-card')
    expect(cards[1].querySelector('.project-links')).toBeNull()
  })

  it('still links each title', () => {
    renderProjects()
    expect(screen.getByRole('link', { name: 'Spine' })).toHaveAttribute(
      'href',
      '/spine',
    )
    expect(screen.getByRole('link', { name: 'This Website' })).toHaveAttribute(
      'href',
      'https://github.com/joeyh92989/joey-haas.dev',
    )
  })
})
