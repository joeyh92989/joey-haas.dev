import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { monthIndex } from '../lib/monthInReview.js'
import MonthIndex from './MonthIndex.jsx'
import { axeViolations } from '../lib/axe.test-util.js'

const ITEMS = [
  { id: 'a', type: 'game', title: 'A', finished_at: '2026-09-04' },
  { id: 'b', type: 'game', title: 'B', finished_at: '2026-09-20' },
  { id: 'c', type: 'game', title: 'C', finished_at: '2026-11-02' },
]
const SESSIONS = [{ item_id: 'd', title: 'D', played_on: '2026-10-05' }]

function renderIndex(
  current = '2026-10',
  previous = '2026-09',
  next = '2026-11',
) {
  return render(
    <MemoryRouter>
      <MonthIndex
        cells={monthIndex(ITEMS, SESSIONS, 2026)}
        current={current}
        previous={previous}
        next={next}
      />
    </MemoryRouter>,
  )
}

describe('MonthIndex', () => {
  it('has twelve cells in a named list', () => {
    renderIndex()
    const nav = screen.getByRole('navigation', { name: 'Months' })
    expect(within(nav).getAllByRole('listitem')).toHaveLength(12)
  })

  it('links only the months with entries, with counts readable', () => {
    renderIndex()
    const list = screen.getByRole('list')
    expect(
      within(list).getByRole('link', { name: 'September 2026, 2 finished' }),
    ).toHaveAttribute('href', '/shelf/journal/2026-09/')
    expect(
      within(list).getByRole('link', { name: 'November 2026, 1 finished' }),
    ).toHaveAttribute('href', '/shelf/journal/2026-11/')
    expect(within(list).getAllByRole('link')).toHaveLength(2)
    expect(within(list).getByText('August 2026, nothing')).toBeInTheDocument()
  })

  it('links a month that only has sessions', () => {
    renderIndex('2026-09', null, '2026-10')
    expect(
      screen.getByRole('link', { name: 'October 2026, played' }),
    ).toHaveAttribute('href', '/shelf/journal/2026-10/')
  })

  it('marks the current month and does not link it', () => {
    renderIndex()
    const current = screen
      .getByRole('list')
      .querySelector('[aria-current="page"]')
    expect(current).toHaveTextContent('October 2026, played')
    expect(current.closest('a')).toBeNull()
  })

  it('puts previous and next under the cells', () => {
    renderIndex()
    expect(
      screen.getByRole('link', { name: 'Previous month: September 2026' }),
    ).toHaveAttribute('href', '/shelf/journal/2026-09/')
    expect(
      screen.getByRole('link', { name: 'Next month: November 2026' }),
    ).toHaveAttribute('href', '/shelf/journal/2026-11/')
  })

  it('leaves out an edge that has no neighbour', () => {
    renderIndex('2026-09', null, '2026-10')
    expect(screen.queryByRole('link', { name: /Previous month/ })).toBeNull()
  })

  it('has no axe violations', async () => {
    const { container } = renderIndex()
    expect(await axeViolations(container)).toEqual([])
  })

  it('stays neutral for a month without a finish until the diary is known', () => {
    render(
      <MemoryRouter>
        <MonthIndex
          cells={monthIndex(ITEMS, [], 2026)}
          current="2026-09"
          previous={null}
          next={null}
          known={false}
        />
      </MemoryRouter>,
    )
    const list = screen.getByRole('list')
    expect(within(list).queryByText(/nothing/)).toBeNull()
    expect(within(list).getByText('August 2026')).toBeInTheDocument()
    // Finishes are still known, and still link.
    expect(
      within(list).getByRole('link', { name: 'November 2026, 1 finished' }),
    ).toBeInTheDocument()
    expect(within(list).getAllByRole('link')).toHaveLength(1)
  })

  it('steps from December to January and back across the year', () => {
    const { unmount } = renderIndex('2026-12', '2026-11', '2027-01')
    expect(
      screen.getByRole('link', { name: 'Previous month: November 2026' }),
    ).toHaveAttribute('href', '/shelf/journal/2026-11/')
    expect(
      screen.getByRole('link', { name: 'Next month: January 2027' }),
    ).toHaveAttribute('href', '/shelf/journal/2027-01/')
    unmount()
    renderIndex('2027-01', '2026-12', '2027-02')
    expect(
      screen.getByRole('link', { name: 'Previous month: December 2026' }),
    ).toHaveAttribute('href', '/shelf/journal/2026-12/')
  })
})
