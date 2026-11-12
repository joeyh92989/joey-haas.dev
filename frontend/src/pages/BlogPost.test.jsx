import '@testing-library/jest-dom'
import { act, render, screen, within } from '@testing-library/react'
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
  const heads = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `part-${i + 1}`,
      text: `Part ${i + 1}`,
    }))
  posts.push(
    {
      slug: 'four',
      frontmatter: { title: 'Four', date: '2026-08-01', tags: [] },
      html: '<p>Body.</p>',
      headings: heads(4),
    },
    {
      slug: 'five',
      frontmatter: { title: 'Five', date: '2026-07-01', tags: [] },
      html: '<h2 id="part-2">Part 2</h2><h2 id="part-3">Part 3</h2>',
      headings: heads(5),
    },
  )
  return {
    posts,
    findPost: (slug) => posts.find((post) => post.slug === slug),
  }
})

function renderPost(slug, hash = '') {
  return render(
    <MemoryRouter initialEntries={[`/blog/${slug}${hash}`]}>
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

  it('lists the h2s above four of them, each linking to its id', () => {
    renderPost('five')
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    const links = within(nav).getAllByRole('link')
    expect(links).toHaveLength(5)
    expect(links[2]).toHaveAttribute('href', '/blog/five#part-3')
    expect(links[2]).toHaveTextContent('Part 3')
  })

  it('has no contents list at four h2s or without headings', () => {
    renderPost('four')
    expect(screen.queryByText('On this page')).toBeNull()
    renderPost('without')
    expect(screen.queryByText('On this page')).toBeNull()
  })

  it('opens with the breadcrumb, Blog then the title, above the h1', () => {
    const { container } = renderPost('without')
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Blog' })).toHaveAttribute(
      'href',
      '/blog',
    )
    const last = crumbs.querySelector('[aria-current="page"]')
    expect(last).toHaveTextContent(container.querySelector('h1').textContent)
    expect(
      crumbs.compareDocumentPosition(container.querySelector('h1')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.queryByText('← All posts')).toBeNull()
  })

  it('moves focus to the heading a contents link names', () => {
    renderPost('five')
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    expect(within(nav).getByRole('link', { name: 'Part 3' })).toHaveAttribute(
      'href',
      '/blog/five#part-3',
    )
    act(() => within(nav).getByRole('link', { name: 'Part 3' }).click())
    expect(document.getElementById('part-3')).toHaveFocus()
  })

  it('lands on the heading named by the address when the post opens', () => {
    renderPost('five', '#part-2')
    const target = document.getElementById('part-2')
    expect(target).toHaveFocus()
    expect(target).toHaveAttribute('tabindex', '-1')
  })

  it('ignores an address that names nothing on the page', () => {
    renderPost('five', '#nope')
    expect(document.body).toHaveFocus()
  })
})
