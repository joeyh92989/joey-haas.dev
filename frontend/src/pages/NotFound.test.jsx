import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import NotFound from './NotFound.jsx'

describe('NotFound', () => {
  it('offers the shelf and home as ways out', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'the shelf' })).toHaveAttribute(
      'href',
      '/shelf',
    )
    expect(screen.getByRole('link', { name: 'go home' })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('marks the page noindex while mounted and removes it on leave', () => {
    const { unmount } = render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    )
    const tags = document.head.querySelectorAll('meta[name="robots"]')
    expect(tags).toHaveLength(1)
    expect(tags[0]).toHaveAttribute('content', 'noindex')
    unmount()
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
  })
})
