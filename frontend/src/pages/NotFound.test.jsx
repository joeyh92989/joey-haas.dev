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
})
