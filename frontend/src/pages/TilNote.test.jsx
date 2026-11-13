import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import TilNote from './TilNote.jsx'
import { axeViolations } from '../lib/axe.test-util.js'

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
  it('renders the note alone, under a TIL breadcrumb', () => {
    renderAt('a-note')
    expect(
      screen.getByRole('heading', { level: 1, name: 'A note' }),
    ).toBeInTheDocument()
    expect(screen.getByText('The body.')).toBeInTheDocument()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'TIL' })).toHaveAttribute(
      'href',
      '/til',
    )
    expect(crumbs.querySelector('[aria-current="page"]')).toHaveTextContent(
      'A note',
    )
    expect(screen.queryByText('← All notes')).toBeNull()
    expect(document.title).toBe('A note · TIL · Joey Haas')
  })

  it('renders NotFound for an unknown slug', () => {
    renderAt('not-a-note')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Not found' }),
    ).toBeInTheDocument()
    expect(document.title).toBe('Not found · Joey Haas')
  })

  it('has no axe violations', async () => {
    const { container } = renderAt('a-note')
    expect(await axeViolations(container)).toEqual([])
  })
})
