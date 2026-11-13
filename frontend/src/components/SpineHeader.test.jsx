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
  it('is never the page h1: the name is a link, above the tab row', () => {
    renderAt('/shelf/games')
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    const tabs = screen.getByRole('navigation', { name: 'My Shelf sections' })
    expect(tabs).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Games' })).toHaveClass('active')
    expect(screen.getByRole('link', { name: 'What’s next' })).not.toHaveClass(
      'active',
    )
  })

  it('links back to the shelf, not an h1, on a sub-page', () => {
    renderAt('/shelf/next')
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.getByRole('link', { name: 'My Shelf' })).toHaveAttribute(
      'href',
      '/shelf',
    )
    expect(screen.getByRole('link', { name: 'What’s next' })).toHaveClass(
      'active',
    )
    expect(screen.getByRole('link', { name: 'Games' })).not.toHaveClass(
      'active',
    )
  })

  it('has a fourth tab, Tour, active only on its page', () => {
    renderAt('/shelf/how')
    const how = screen.getByRole('link', { name: 'Tour' })
    expect(how).toHaveAttribute('href', '/shelf/how')
    expect(how).toHaveClass('active')
    expect(how.querySelector('.spine-tab-badge')).toBeNull()
    expect(screen.getByRole('link', { name: 'Games' })).not.toHaveClass(
      'active',
    )
    expect(screen.getAllByRole('link', { name: /./ })).toHaveLength(7)
  })

  it('leaves Tour inactive elsewhere under /shelf', () => {
    renderAt('/shelf/next')
    expect(screen.getByRole('link', { name: /Tour/ })).not.toHaveClass('active')
  })

  it('has a Comics tab after Games, active on its page', () => {
    renderAt('/shelf/comics')
    const comics = screen.getByRole('link', { name: 'Comics' })
    expect(comics).toHaveAttribute('href', '/shelf/comics')
    expect(comics).toHaveClass('active')
    expect(screen.getByRole('link', { name: 'Games' })).not.toHaveClass(
      'active',
    )
    const names = screen.getAllByRole('link').map((link) => link.textContent)
    expect(names.indexOf('Comics')).toBe(names.indexOf('Games') + 1)
  })

  it('ends with a Daily tab, active only on /daily', () => {
    renderAt('/daily')
    const names = screen.getAllByRole('link').map((link) => link.textContent)
    expect(names.at(-1)).toBe('Daily game')
    const tab = screen.getByRole('link', { name: 'Daily game' })
    expect(tab).toHaveAttribute('href', '/daily')
    expect(tab).toHaveClass('active')
  })

  it('shows the Comics tab unless the build says there are no comics', () => {
    renderAt('/shelf/games')
    expect(screen.getByRole('link', { name: 'Comics' })).toHaveAttribute(
      'href',
      '/shelf/comics',
    )
  })
})
