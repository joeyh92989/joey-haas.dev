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
      screen.getByRole('heading', { level: 1, name: 'My Shelf' }),
    ).toBeInTheDocument()
    const tabs = screen.getByRole('navigation', { name: 'My Shelf sections' })
    expect(tabs).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Collection' })).toHaveClass(
      'active',
    )
    expect(screen.getByRole('link', { name: 'What’s next' })).not.toHaveClass(
      'active',
    )
  })

  it('links back to the shelf, not an h1, on a sub-page', () => {
    renderAt('/spine/next', { asLink: true })
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.getByRole('link', { name: 'My Shelf' })).toHaveAttribute(
      'href',
      '/spine',
    )
    expect(screen.getByRole('link', { name: 'What’s next' })).toHaveClass(
      'active',
    )
    expect(screen.getByRole('link', { name: 'Collection' })).not.toHaveClass(
      'active',
    )
  })

  it('has a fourth tab, How it works, active only on its page', () => {
    renderAt('/spine/how', { asLink: true })
    const how = screen.getByRole('link', { name: 'How it works' })
    expect(how).toHaveAttribute('href', '/spine/how')
    expect(how).toHaveClass('active')
    expect(how.querySelector('.spine-tab-badge')).toBeNull()
    expect(screen.getByRole('link', { name: 'Collection' })).not.toHaveClass(
      'active',
    )
    expect(screen.getAllByRole('link', { name: /./ })).toHaveLength(5)
  })

  it('leaves How it works inactive elsewhere under /spine', () => {
    renderAt('/spine/next', { asLink: true })
    expect(screen.getByRole('link', { name: /How it works/ })).not.toHaveClass(
      'active',
    )
  })
})
