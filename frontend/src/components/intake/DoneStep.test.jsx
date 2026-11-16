import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import DoneStep from './DoneStep.jsx'

vi.mock('../../lib/api.js', () => ({
  apiFetch: vi.fn(),
  errorMessage: vi.fn(),
}))

const base = {
  added: 1,
  already_owned: 0,
  issues_added: 0,
  series_grew: [],
  skipped_kept: 0,
  photos_empty: 0,
  photos_waiting: 0,
  created: ['x'],
}

function done(answer, sitting = { area: 'shelf', kind: 'comic' }) {
  render(
    <MemoryRouter>
      <DoneStep
        answer={{ ...base, ...answer }}
        sitting={sitting}
        onNextBox={vi.fn()}
        startingNext={false}
        headingRef={{ current: null }}
      />
    </MemoryRouter>,
  )
}

describe('DoneStep comic lines', () => {
  it('says what a new series brought', () => {
    done({
      series_new: [
        {
          title: 'Waterworld',
          cover_url: null,
          issues: [1, 2, 3, 4],
          editions: [],
        },
        {
          title: 'Saga',
          cover_url: null,
          issues: [],
          editions: [{ kind: 'Trade', label: 'Vol. 4', from: 19, to: 24 }],
        },
      ],
    })
    expect(screen.getByText('Waterworld · adds #1–4')).toBeVisible()
    expect(screen.getByText('Saga · adds Vol. 4 (Trade, #19–24)')).toBeVisible()
  })

  it('says the edition a series already on the shelf gained', () => {
    done({
      added: 0,
      series_grew: [
        {
          item_id: 'i1',
          title: 'Creepshow',
          is_public: true,
          cover_url: null,
          before: { owned: 2, released: 5 },
          ongoing: false,
          added: [],
          already: [],
          editions_added: [
            { kind: 'Omnibus', label: 'Vol. 1', from: 1, to: 5 },
          ],
          after_owned_text: '1–5',
        },
      ],
    })
    expect(
      screen.getByText('Creepshow · adds Vol. 1 (Omnibus, #1–5)'),
    ).toBeVisible()
  })

  it('has no list when nothing carried issues', () => {
    done({ series_new: [] })
    expect(screen.queryByText('Added to the shelf')).toBeNull()
  })

  it('lists two new series with one title apart, by their ids', () => {
    const series = (id) => ({
      title: 'Waterworld',
      external_source: 'comicvine',
      external_id: id,
      cover_url: null,
      issues: [1],
      editions: [],
    })
    done({ series_new: [series('1'), series('2')] })
    expect(screen.getAllByText('Waterworld · adds #1')).toHaveLength(2)
  })
})

describe('DoneStep after a seed file', () => {
  const closet = { area: 'closet', kind: 'garment' }

  it('counts what the file skipped, repeated and could not photograph', () => {
    done(
      {
        added: 5,
        images_missing: 2,
        file_import: {
          added: 5,
          skipped_not_owned: 19,
          skipped_known_not_owned: 3,
          already_imported: 7,
          duplicates: 1,
          unreadable: 0,
        },
      },
      closet,
    )
    const tile = (label) => screen.getByText(label).parentElement
    expect(tile('skipped, not owned')).toHaveTextContent('19')
    expect(tile('skipped, marked not owned before')).toHaveTextContent('3')
    expect(tile('skipped, already imported')).toHaveTextContent('7')
    expect(tile('repeated in the file')).toHaveTextContent('1')
    expect(tile('added without a photo')).toHaveTextContent('2')
    // A count that is zero is not a tile.
    expect(screen.queryByText('lines not understood')).toBeNull()
  })

  it('shows none of it for a sitting no file was added to', () => {
    done({ file_import: null, images_missing: 0 }, closet)
    expect(screen.queryByText(/skipped, not owned/)).toBeNull()
    expect(screen.queryByText('added without a photo')).toBeNull()
  })
})
