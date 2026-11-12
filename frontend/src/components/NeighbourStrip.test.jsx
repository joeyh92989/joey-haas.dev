import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import NeighbourStrip from './NeighbourStrip.jsx'

const SERIES = { id: 'abc', title: 'Saga' }
const LIST = [
  { number: 57, cover_url: null, state: 'read' },
  { number: 58, cover_url: null, state: 'owned' },
  { number: 59, cover_url: null, state: 'missing' },
  { number: 60, cover_url: null, state: 'not-out' },
]

function renderStrip() {
  return render(
    <MemoryRouter>
      <NeighbourStrip list={LIST} current={58} series={SERIES} />
    </MemoryRouter>,
  )
}

describe('NeighbourStrip', () => {
  it('is a labelled list with the current issue marked', () => {
    renderStrip()
    const list = screen.getByRole('list', { name: 'Neighbouring issues' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    const current = within(list).getByRole('link', { name: 'Saga #58, Owned' })
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(
      within(list).getByRole('link', { name: 'Saga #57, Read' }),
    ).not.toHaveAttribute('aria-current')
  })

  it('links to the issue pages', () => {
    renderStrip()
    expect(
      screen.getByRole('link', { name: 'Saga #59, Missing' }),
    ).toHaveAttribute('href', '/shelf/abc/59/')
  })

  it('draws the not-out tile as a non-link', () => {
    renderStrip()
    expect(screen.queryByRole('link', { name: /#60/ })).toBeNull()
    expect(screen.getByText('Not out yet')).toBeInTheDocument()
  })

  it('scrolls the current tile into view when it can', () => {
    const scrolled = []
    Element.prototype.scrollIntoView = function scrollIntoView() {
      scrolled.push(this.querySelector('a').getAttribute('aria-label'))
    }
    try {
      renderStrip()
      expect(scrolled).toEqual(['Saga #58, Owned'])
    } finally {
      delete Element.prototype.scrollIntoView
    }
  })
})
