import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import BlogPost from './BlogPost.jsx'

vi.mock('../content/posts.js', () => {
  const posts = [
    {
      slug: 'with-summary',
      frontmatter: {
        title: 'With a summary',
        date: '2026-10-02',
        tags: [],
        summary: 'What it is, in a line.',
      },
      html: '<p>Body.</p>',
    },
    {
      slug: 'without',
      frontmatter: { title: 'Without', date: '2026-09-01', tags: [] },
      html: '<p>Body.</p>',
    },
  ]
  return {
    posts,
    findPost: (slug) => posts.find((post) => post.slug === slug),
    formatDate: (date) => date,
  }
})

function renderPost(slug) {
  return render(
    <MemoryRouter initialEntries={[`/blog/${slug}`]}>
      <Routes>
        <Route path="/blog/:slug" element={<BlogPost />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('BlogPost', () => {
  it('puts the summary under the title', () => {
    const { container } = renderPost('with-summary')
    expect(screen.getByText('What it is, in a line.')).toHaveClass(
      'post-summary',
    )
    expect(container.querySelector('h1').nextElementSibling).toHaveClass(
      'post-summary',
    )
  })

  it('has no summary line when the post has none', () => {
    const { container } = renderPost('without')
    expect(container.querySelector('.post-summary')).toBeNull()
  })
})
