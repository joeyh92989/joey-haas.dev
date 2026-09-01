import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RootLayout from './RootLayout.jsx'

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RootLayout />
    </MemoryRouter>,
  )
}

/** The toggle is labelled by its action, and named for the theme it switches to. */
function toggle(target) {
  return screen.getByRole('button', { name: `Switch to ${target} theme` })
}

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('RootLayout theme toggle', () => {
  it('defaults to dark when nothing is stored', () => {
    renderAt()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(toggle('light')).toHaveTextContent('Light')
  })

  it('restores a stored preference', () => {
    localStorage.setItem('theme', 'light')
    renderAt()
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(toggle('dark')).toHaveTextContent('Dark')
  })

  // A stray value must not leave the page on a theme with no token block.
  it('falls back to dark when the stored value is not a theme', () => {
    localStorage.setItem('theme', 'solarized')
    renderAt()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('flips the theme on click and persists the choice', () => {
    renderAt()

    fireEvent.click(toggle('light'))

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('theme')).toBe('light')
    expect(toggle('dark')).toBeInTheDocument()
  })

  // Nothing is stored until the visitor chooses: writing the default on mount
  // would pin everyone to it if the default ever changed.
  it('does not persist a theme the visitor never chose', () => {
    renderAt()
    expect(localStorage.getItem('theme')).toBeNull()
  })

  // Storage throws outright in some private-browsing modes. An uncaught throw
  // here would blank the layout on every route.
  it('still renders and toggles when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })

    renderAt()
    expect(document.documentElement.dataset.theme).toBe('dark')

    fireEvent.click(toggle('light'))
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
