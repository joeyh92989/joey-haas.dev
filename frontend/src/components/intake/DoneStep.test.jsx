import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
// Built by backend/scripts/export_intake_comic_fixtures.py from CommitOut.
import commit from '../../../e2e/fixtures/api/intake-comic-commit.json'
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
          books: [],
        },
        {
          title: 'Saga',
          cover_url: null,
          issues: [],
          books: [{ kind: 'Trade', label: 'Vol. 4', from: 19, to: 24 }],
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
          books_added: [{ kind: 'Omnibus', label: 'Vol. 1', from: 1, to: 5 }],
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
      books: [],
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

describe('DoneStep books and titles', () => {
  it('counts the new books and titles in one line', () => {
    done(commit)
    expect(screen.getByText('2 new books, 1 new title')).toBeVisible()
  })

  it('lists each new book with its number in the line, linked to its page', () => {
    done(commit)
    const list = screen.getByRole('list', { name: 'New books' })
    const [first, second] = within(list).getAllByRole('listitem')
    expect(first).toHaveTextContent('Saga Book Two')
    expect(first).toHaveTextContent('Vol. 2')
    expect(first).toHaveTextContent('Saga')
    expect(
      within(first).getByRole('link', { name: 'Saga Book Two' }),
    ).toHaveAttribute(
      'href',
      `/admin/shelf/comics/${commit.volumes_new[0].title_id}/vol-2`,
    )
    expect(second).toHaveTextContent('Hidden Run')
    expect(second).not.toHaveTextContent('Vol.')
  })

  it('lists each new title, linked to its page', () => {
    done(commit)
    const list = screen.getByRole('list', { name: 'New titles' })
    expect(
      within(list).getByRole('link', { name: 'Hidden Run' }),
    ).toHaveAttribute(
      'href',
      `/admin/shelf/comics/${commit.titles_created[0].id}`,
    )
  })

  it('says one book and no titles in the singular, and omits empty lists', () => {
    done({
      ...commit,
      volumes_new: [commit.volumes_new[0]],
      titles_created: [],
    })
    expect(screen.getByText('1 new book')).toBeVisible()
    expect(screen.queryByRole('list', { name: 'New titles' })).toBeNull()
  })

  it('has neither list for an answer from before books', () => {
    done({})
    expect(screen.queryByText('New books')).toBeNull()
    expect(screen.queryByText('New titles')).toBeNull()
  })

  it('never says edition to the reader', () => {
    done(commit)
    expect(document.body.textContent.toLowerCase()).not.toContain('edition')
  })
})

describe('DoneStep actions (#490, #494)', () => {
  const labels = () =>
    screen
      .getAllByRole('button')
      .concat(screen.getAllByRole('link'))
      .map((el) => el.textContent)

  it('offers Publish first, and says the new rows are private', () => {
    done({ created: ['a', 'b'] })
    expect(screen.getAllByRole('button')[0]).toHaveTextContent(
      'Publish these 2',
    )
    expect(screen.getByText(/These are private/)).toBeVisible()
    expect(labels()).toContain('Shoot the next box')
  })

  it('leads with the next box when there is nothing to publish', () => {
    done({ created: [] })
    expect(screen.getAllByRole('button')[0]).toHaveTextContent(
      'Shoot the next box',
    )
    expect(screen.queryByText(/These are private/)).toBeNull()
  })
})
