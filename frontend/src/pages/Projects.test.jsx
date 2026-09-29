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
      name: 'Media Collection',
      description: 'A tracker.',
      tech: ['React'],
      to: '/collection',
      url: null,
      strip: 'favourites',
      more: { to: '/blog/how-the-tracker-works', label: 'How it works' },
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

  it('renders a more link only where one is set', () => {
    renderProjects()
    expect(screen.getByRole('link', { name: /How it works/ })).toHaveAttribute(
      'href',
      '/blog/how-the-tracker-works',
    )
    expect(screen.getAllByRole('link', { name: /How it works/ })).toHaveLength(
      1,
    )
  })

  it('still links each title', () => {
    renderProjects()
    expect(
      screen.getByRole('link', { name: 'Media Collection' }),
    ).toHaveAttribute('href', '/collection')
    expect(screen.getByRole('link', { name: 'This Website' })).toHaveAttribute(
      'href',
      'https://github.com/joeyh92989/joey-haas.dev',
    )
  })
})
