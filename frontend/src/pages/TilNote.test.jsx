import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import TilNote from './TilNote.jsx'

vi.mock('../content/notes.js', () => {
  const notes = [
    {
      slug: 'a-note',
      frontmatter: { title: 'A note', date: '2026-11-06', tags: [] },
      html: '<p>The body.</p>',
    },
  ]
  return { notes, findNote: (slug) => notes.find((n) => n.slug === slug) }
})

function renderAt(slug) {
  return render(
    <MemoryRouter initialEntries={[`/til/${slug}`]}>
      <Routes>
        <Route path="/til/:slug" element={<TilNote />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('TilNote', () => {
  it('renders the note alone, under a link back to every note', () => {
    renderAt('a-note')
    expect(
      screen.getByRole('heading', { level: 1, name: 'A note' }),
    ).toBeInTheDocument()
    expect(screen.getByText('The body.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← All notes' })).toHaveAttribute(
      'href',
      '/til',
    )
    expect(document.title).toBe('A note · TIL · Joey Haas')
  })

  it('renders NotFound for an unknown slug', () => {
    renderAt('not-a-note')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Not found' }),
    ).toBeInTheDocument()
    expect(document.title).toBe('Not found · Joey Haas')
  })
})
