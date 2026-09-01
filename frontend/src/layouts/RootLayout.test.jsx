import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import RootLayout from './RootLayout.jsx'

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RootLayout />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

afterEach(() => {
  localStorage.clear()
})

describe('RootLayout theme toggle', () => {
  it('defaults to dark when nothing is stored', () => {
    renderAt()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument()
  })

  it('restores a stored preference', () => {
    localStorage.setItem('theme', 'light')
    renderAt()
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument()
  })

  // A stray value must not leave the page on a theme with no token block.
  it('falls back to dark when the stored value is not a theme', () => {
    localStorage.setItem('theme', 'solarized')
    renderAt()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('flips the theme on click and persists it', () => {
    renderAt()

    fireEvent.click(screen.getByRole('button', { name: 'Light' }))

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('theme')).toBe('light')
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument()
  })
})
