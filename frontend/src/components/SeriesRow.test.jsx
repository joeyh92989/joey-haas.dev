import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import SeriesList from './SeriesList.jsx'

const SAGA = {
  item_id: 'a',
  title: 'Saga',
  publisher: 'Image',
  year: 2012,
  cover_url: null,
  ongoing: true,
  following: true,
  wanted: false,
  shelf_format: 'trades',
  edition_labels: ['Vol. 1–9'],
  owned: 54,
  released: 72,
  missing: 18,
  run_state: 'gaps',
  segments: [
    { kind: 'owned', length: 54 },
    { kind: 'missing', length: 18 },
    { kind: 'upcoming', length: 7 },
  ],
  status: 'active',
  read_to: 40,
  read: 40,
  next_issue: { number: '73', store_date: '2026-11-11' },
}

const WANT = {
  ...SAGA,
  item_id: 'b',
  title: 'Paper Girls',
  following: false,
  wanted: true,
  owned: 0,
  missing: 0,
  run_state: null,
  segments: [],
  status: 'backlog',
  read_to: null,
  read: 0,
  next_issue: null,
}

function renderList(rows) {
  return render(
    <MemoryRouter>
      <SeriesList rows={rows} linkFor={(row) => `/shelf/${row.item_id}/`} />
    </MemoryRouter>,
  )
}

describe('SeriesList', () => {
  it('shows a run with its bar, count, next issue and read marker', () => {
    renderList([SAGA])
    const row = screen.getAllByRole('listitem').find((li) => li.matches('.series-row'))
    expect(within(row).getByRole('link', { name: 'Saga' })).toHaveAttribute(
      'href',
      '/shelf/a/',
    )
    expect(row).toHaveTextContent('Following')
    expect(row).toHaveTextContent('Image · 2012– · Trades (Vol. 1–9) · Reading, read to #40')
    // AC3: the bar is the run the API sent, released plus the tail.
    const bar = within(row).getByRole('img', { name: '54 of 72 issues owned, ongoing' })
    const lengths = [...bar.querySelectorAll('i')].map((i) => Number(i.style.flexGrow))
    expect(lengths.reduce((a, b) => a + b, 0)).toBe(72 + 7)
    expect(row).toHaveTextContent('54 / 72+')
    expect(row).toHaveTextContent('Next #73 · Nov 11')
  })

  it('gives a want no bar and no count, and keeps the key only for runs', () => {
    const { container } = renderList([WANT])
    expect(screen.queryByRole('img')).toBeNull()
    expect(container.querySelector('.series-count')).toBeNull()
    expect(screen.queryByRole('list', { name: 'Run bar key' })).toBeNull()
    expect(screen.getByText('Want')).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = renderList([SAGA, WANT])
    expect(await axeViolations(container)).toEqual([])
  })
})
