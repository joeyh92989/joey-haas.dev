import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Til from './Til.jsx'

// notes.js globs markdown the Vitest config cannot compile, so it is
// replaced; tests fill this array.
const content = vi.hoisted(() => ({ notes: [] }))
vi.mock('../content/notes.js', () => ({
  get notes() {
    return content.notes
  },
}))

const note = (slug, title, date, html) => ({
  slug,
  frontmatter: { title, date, tags: ['render'], draft: false },
  html,
})

afterEach(() => {
  content.notes = []
})

function renderTil() {
  return render(
    <MemoryRouter>
      <Til />
    </MemoryRouter>,
  )
}

describe('Til', () => {
  it('renders every note in full, in the order given, each linking to its page', () => {
    content.notes = [
      note('newer', 'Newer note', '2026-11-06', '<p>Newer body.</p>'),
      note('older', 'Older note', '2026-10-01', '<p>Older body.</p>'),
    ]
    renderTil()
    const articles = screen.getAllByRole('article')
    expect(articles).toHaveLength(2)
    const titles = screen.getAllByRole('heading', { level: 2 })
    expect(titles.map((h) => h.textContent)).toEqual([
      'Newer note',
      'Older note',
    ])
    expect(screen.getByRole('link', { name: 'Newer note' })).toHaveAttribute(
      'href',
      '/til/newer',
    )
    expect(screen.getByText('Older body.')).toBeInTheDocument()
    expect(screen.getAllByText('render')).toHaveLength(2)
    expect(screen.getByText('November 6, 2026')).toHaveAttribute(
      'dateTime',
      '2026-11-06',
    )
  })

  it('points at the blog for longer pieces', () => {
    renderTil()
    expect(screen.getByRole('link', { name: 'blog' })).toHaveAttribute(
      'href',
      '/blog',
    )
  })

  it('says so when there are no notes', () => {
    renderTil()
    expect(screen.getByText('No notes yet.')).toBeInTheDocument()
    expect(screen.queryByRole('article')).toBeNull()
  })
})
