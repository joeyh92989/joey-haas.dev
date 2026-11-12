import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import AddResults from './AddResults.jsx'

const comic = (id, extra = {}) => ({
  kind: 'comic',
  external_source: 'comicvine',
  external_id: String(id),
  title: 'Creepshow',
  year: 2024,
  thumbnail_url: null,
  owned_item_id: null,
  ...extra,
})

describe('AddResults', () => {
  it('reads same-titled comic results differently by publisher and issue count', () => {
    render(
      <MemoryRouter>
        <AddResults
          query="creepshow"
          results={[
            comic(1, { publisher: 'Image', issue_count: 5 }),
            comic(2, { year: 1982, publisher: 'DC', issue_count: 1 }),
            comic(3, { year: 2000 }),
          ]}
          sources={[]}
          kinds={{ comic: { key: 'comic', label: 'Comic', ways_in: [] } }}
          onAdd={vi.fn()}
          onKeepTyped={vi.fn()}
        />
      </MemoryRouter>,
    )
    const rows = within(
      screen.getByRole('list', { name: 'Results for “creepshow”' }),
    ).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('2024 · Image · 5 issues · comicvine')
    expect(rows[1]).toHaveTextContent('1982 · DC · 1 issue · comicvine')
    expect(rows[2]).toHaveTextContent(/2000 · comicvine/)
    expect(rows[2]).not.toHaveTextContent('issue')
  })
})
