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
      name: 'My Shelf',
      tagline: 'A tracker for a physical game collection',
      description: 'A tracker.',
      line: 'I built this.',
      highlights: ['Photo import.', 'Play next.'],
      links: [
        { to: '/shelf', label: 'Open My Shelf' },
        {
          href: 'https://github.com/joeyh92989/joey-haas.dev',
          label: 'Source',
        },
      ],
      tech: ['React'],
      to: '/shelf',
      url: null,
      strip: 'favourites',
      hero: {
        slug: 'my-shelf',
        alt: 'The Games page.',
        width: 1200,
        height: 560,
      },
    },
    {
      name: 'This site',
      differently: 'A line Joey wrote.',
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
  it('draws a hero in both themes only where set, with its size and alt', () => {
    const { container } = renderProjects()
    const cards = container.querySelectorAll('.project-card')
    const images = cards[0].querySelectorAll('img.project-hero__img')
    expect(images).toHaveLength(2)
    expect(images[0]).toHaveAttribute('src', '/projects/my-shelf-dark.webp')
    expect(images[1]).toHaveAttribute('src', '/projects/my-shelf-light.webp')
    for (const image of images) {
      expect(image).toHaveAttribute('alt', 'The Games page.')
      expect(image).toHaveAttribute('width', '1200')
      expect(image).toHaveAttribute('height', '560')
      expect(image).toHaveAttribute('loading', 'lazy')
    }
    expect(cards[1].querySelector('.project-hero')).toBeNull()
  })

  it('shows the differently line only when it is set', () => {
    const { container } = renderProjects()
    const cards = container.querySelectorAll('.project-card')
    expect(cards[0].querySelector('.project-differently')).toBeNull()
    expect(cards[1].querySelector('.project-differently')).toHaveTextContent(
      'A line Joey wrote.',
    )
  })

  it('gives a card with a strip its favourite covers', async () => {
    const { container } = renderProjects()
    const cards = container.querySelectorAll('.project-card')
    await waitFor(() =>
      expect(cards[0].querySelectorAll('.cover-strip img')).toHaveLength(1),
    )
    expect(cards[1].querySelector('.cover-strip')).toBeNull()
  })

  it('renders a tagline, line and highlights only where set', () => {
    const { container } = renderProjects()
    const cards = container.querySelectorAll('.project-card')
    expect(cards[0].querySelector('.project-tagline')).toHaveTextContent(
      'A tracker for a physical game collection',
    )
    expect(cards[0].querySelectorAll('.project-highlights li')).toHaveLength(2)
    expect(cards[1].querySelector('.project-tagline')).toBeNull()
    expect(cards[1].querySelector('.project-highlights')).toBeNull()
    expect(cards[0].querySelector('.project-line')).toHaveTextContent(
      'I built this.',
    )
    expect(cards[1].querySelector('.project-line')).toBeNull()
  })

  it('links in-site with the router and away with an anchor', () => {
    const { container } = renderProjects()
    expect(screen.getByRole('link', { name: /Open My Shelf/ })).toHaveAttribute(
      'href',
      '/shelf',
    )
    // The decorative arrow stays out of the accessible name.
    expect(
      screen.getByRole('link', { name: 'Open My Shelf' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Source/ })).toHaveAttribute(
      'href',
      'https://github.com/joeyh92989/joey-haas.dev',
    )
    const cards = container.querySelectorAll('.project-card')
    expect(cards[1].querySelector('.project-links')).toBeNull()
  })

  it('still links each title', () => {
    renderProjects()
    expect(screen.getByRole('link', { name: 'My Shelf' })).toHaveAttribute(
      'href',
      '/shelf',
    )
    expect(screen.getByRole('link', { name: 'This site' })).toHaveAttribute(
      'href',
      'https://github.com/joeyh92989/joey-haas.dev',
    )
  })
})
