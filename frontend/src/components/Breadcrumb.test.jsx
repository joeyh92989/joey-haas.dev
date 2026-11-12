import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import Breadcrumb from './Breadcrumb.jsx'

const trail = [
  { label: 'My Shelf', to: '/shelf' },
  { label: 'Comics', to: '/shelf/comics' },
  { label: '#5' },
]

function renderTrail(props) {
  return render(
    <MemoryRouter>
      <Breadcrumb trail={trail} {...props} />
    </MemoryRouter>,
  )
}

describe('Breadcrumb', () => {
  it('is a named nav holding an ordered list', () => {
    renderTrail()
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav).toHaveClass('crumbs')
    expect(within(nav).getAllByRole('listitem')).toHaveLength(3)
    expect(nav.querySelector('ol')).not.toBeNull()
  })

  it('takes a custom accessible name', () => {
    renderTrail({ label: 'You are here' })
    expect(
      screen.getByRole('navigation', { name: 'You are here' }),
    ).toBeInTheDocument()
  })

  it('links every crumb but the last, which is the current page', () => {
    renderTrail()
    expect(screen.getByRole('link', { name: 'My Shelf' })).toHaveAttribute(
      'href',
      '/shelf',
    )
    expect(screen.getByRole('link', { name: 'Comics' })).toHaveAttribute(
      'href',
      '/shelf/comics',
    )
    expect(screen.queryByRole('link', { name: '#5' })).toBeNull()
    expect(screen.getByText('#5')).toHaveAttribute('aria-current', 'page')
    expect(document.querySelectorAll('[aria-current]')).toHaveLength(1)
  })

  it('draws no separator in the markup, so none is announced', () => {
    renderTrail()
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav.textContent).toBe('My ShelfComics#5')
  })
})
