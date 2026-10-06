import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import SpineHeader from './SpineHeader.jsx'

function renderAt(path, props) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SpineHeader {...props} />
    </MemoryRouter>,
  )
}

describe('SpineHeader', () => {
  it('is the page h1 on the shelf, with the tab row', () => {
    renderAt('/spine')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Spine' }),
    ).toBeInTheDocument()
    const tabs = screen.getByRole('navigation', { name: 'Spine sections' })
    expect(tabs).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Shelf' })).toHaveClass('active')
    expect(screen.getByRole('link', { name: 'What’s next' })).not.toHaveClass(
      'active',
    )
  })

  it('links back to the shelf, not an h1, on a sub-page', () => {
    renderAt('/spine/next', { asLink: true })
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.getByRole('link', { name: 'Spine' })).toHaveAttribute(
      'href',
      '/spine',
    )
    expect(screen.getByRole('link', { name: 'What’s next' })).toHaveClass(
      'active',
    )
    expect(screen.getByRole('link', { name: 'Shelf' })).not.toHaveClass(
      'active',
    )
  })
})
