import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import CoverTile from './CoverTile.jsx'

const SERIES = { id: 'abc', title: 'Saga' }
const cover = (over = {}) => ({
  kind: 'cover',
  n: 58,
  cover_url: 'https://example.test/58.jpg',
  store_date: '2018-05-02',
  state: 'missing',
  ...over,
})

function show(tile, props = {}) {
  return render(
    <MemoryRouter>
      <CoverTile tile={tile} series={SERIES} size="wall" {...props} />
    </MemoryRouter>,
  )
}

describe('CoverTile', () => {
  it('is a link named for the series, number and state, over a decorative image', () => {
    const { container } = show(cover())
    const link = screen.getByRole('link', { name: 'Saga #58, Missing' })
    expect(link).toHaveAttribute('href', '/shelf/abc/58/')
    expect(container.querySelector('img')).toHaveAttribute('alt', '')
  })

  it('marks a read issue with a tick that has no name of its own', () => {
    const { container } = show(cover({ state: 'read' }))
    expect(screen.getByRole('link', { name: 'Saga #58, Read' })).toBeVisible()
    expect(container.querySelector('.cover-tile-tick')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })

  it('marks the current issue', () => {
    show(cover(), { current: true })
    expect(
      screen.getByRole('link', { name: 'Saga #58, Missing' }),
    ).toHaveAttribute('aria-current', 'page')
  })

  it('draws a not-out issue as a block, not a link', () => {
    show({ kind: 'not-out', n: 73, store_date: '2026-12-02' })
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('#73')).toHaveClass('cover-tile-chip')
    // The name carries the series, as a held tile's does.
    expect(screen.getByText('Saga #73, Not out yet')).toBeInTheDocument()
  })
})
