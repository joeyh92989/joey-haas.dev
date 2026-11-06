import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import Blog from './Blog.jsx'

vi.mock('../content/posts.js', () => ({
  posts: [
    {
      slug: 'newer',
      frontmatter: {
        title: 'Newer post',
        date: '2026-10-02',
        tags: [],
        draft: false,
        summary: 'What it is, in a line.',
      },
    },
    {
      slug: 'older',
      frontmatter: { title: 'Older post', date: '2026-09-01', tags: [] },
    },
  ],
}))

function renderBlog() {
  return render(
    <MemoryRouter>
      <Blog />
    </MemoryRouter>,
  )
}

describe('Blog', () => {
  it('lists each post as a dated row linking to it', () => {
    renderBlog()
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(
      within(rows[0]).getByRole('link', { name: 'Newer post' }),
    ).toHaveAttribute('href', '/blog/newer')
    expect(within(rows[0]).getByText('October 2, 2026')).toHaveAttribute(
      'datetime',
      '2026-10-02',
    )
  })

  it('shows a summary only where the post has one', () => {
    renderBlog()
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByText('What it is, in a line.')).toBeVisible()
    expect(rows[1].querySelector('p')).toBeNull()
  })
})
