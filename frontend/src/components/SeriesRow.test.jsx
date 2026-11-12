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
  it('shows a run with its lanes, count, next issue and read marker', () => {
    renderList([SAGA])
    const row = screen
      .getAllByRole('listitem')
      .find((li) => li.matches('.series-row'))
    expect(within(row).getByRole('link', { name: 'Saga' })).toHaveAttribute(
      'href',
      '/shelf/a/',
    )
    expect(row).toHaveTextContent('Following')
    expect(row).toHaveTextContent(
      'Image · 2012– · Trades (Vol. 1–9) · Reading, read to #40',
    )
    // The lanes draw the run the API sent; the tail is a fixed width.
    const lanes = within(row).getByRole('img', {
      name: /^54 of 72 issues owned, .*series still coming out, read to number 40$/,
    })
    expect(lanes.querySelector('.lane-tail [data-k="upcoming"]')).not.toBeNull()
    expect(lanes.querySelector('[data-k="readbar"]')).not.toBeNull()
    expect(row).toHaveTextContent('54 / 72+')
    expect(row).toHaveTextContent('Next #73 · Nov 11')
  })

  it('gives a want no lanes and no count, and keeps the key only for runs', () => {
    const { container } = renderList([WANT])
    expect(screen.queryByRole('img')).toBeNull()
    expect(container.querySelector('.series-count')).toBeNull()
    expect(screen.queryByRole('list', { name: 'Key' })).toBeNull()
    expect(screen.getByText('Want')).toBeInTheDocument()
  })

  it('tells same-titled series apart by year and publisher, and only those', () => {
    const creep = (id, year, publisher) => ({
      ...SAGA,
      item_id: id,
      title: 'Creepshow',
      year,
      publisher,
    })
    renderList([
      creep('c1', 2022, 'Image'),
      creep('c2', 2023, 'Image'),
      creep('c3', 2024, null),
      creep('c4', 2025, 'Skybound'),
      SAGA,
    ])
    const rows = screen
      .getAllByRole('listitem')
      .filter((li) => li.matches('.series-row'))
    const tags = rows.map(
      (li) => li.querySelector('.series-edition')?.textContent,
    )
    expect(tags).toEqual([
      '2022 · Image',
      '2023 · Image',
      '2024',
      '2025 · Skybound',
      undefined,
    ])
  })

  it('has no axe violations', async () => {
    const { container } = renderList([SAGA, WANT])
    expect(await axeViolations(container)).toEqual([])
  })
})
