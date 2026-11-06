import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import SiteFooter from './SiteFooter.jsx'

function renderFooter(signedIn, hasNotes) {
  render(
    <MemoryRouter>
      <SiteFooter signedIn={signedIn} hasNotes={hasNotes} />
    </MemoryRouter>,
  )
  return within(screen.getByRole('contentinfo'))
}

describe('SiteFooter', () => {
  it('credits the year and keeps the site links', () => {
    const footer = renderFooter(false)
    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      `© ${new Date().getFullYear()} Joey Haas`,
    )
    expect(footer.getByRole('link', { name: 'Now' })).toHaveAttribute(
      'href',
      '/now',
    )
    expect(footer.getByRole('link', { name: 'Colophon' })).toHaveAttribute(
      'href',
      '/colophon',
    )
    expect(footer.getByRole('link', { name: 'GitHub' })).toBeInTheDocument()
  })

  it('offers sign-in when signed out', () => {
    const footer = renderFooter(false)
    expect(footer.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(footer.queryByRole('link', { name: 'Admin' })).toBeNull()
  })

  it('links the admin when signed in', () => {
    const footer = renderFooter(true)
    expect(footer.getByRole('link', { name: 'Admin' })).toHaveAttribute(
      'href',
      '/admin',
    )
    expect(footer.queryByRole('link', { name: 'Sign in' })).toBeNull()
  })

  it('links TIL only while a note is published', () => {
    expect(renderFooter(false).queryByRole('link', { name: 'TIL' })).toBeNull()
  })

  it('links TIL between Now and Colophon when notes exist', () => {
    const footer = renderFooter(false, true)
    expect(footer.getByRole('link', { name: 'TIL' })).toHaveAttribute(
      'href',
      '/til',
    )
  })
})
