import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
// Built by backend/scripts/export_intake_comic_fixtures.py from the real
// models and plan functions, not by hand.
import sitting from '../../../e2e/fixtures/api/intake-comic-sitting.json'
import { repeats } from '../../lib/comicBooks.js'
import ComicBooks from './ComicBooks.jsx'

const [single, held, fresh, bare] = sitting.entries

function show(entries, props = {}) {
  const handlers = {
    onToggle: vi.fn(),
    onRemove: vi.fn(),
    onSave: vi.fn().mockResolvedValue(true),
  }
  render(
    <MemoryRouter>
      <ComicBooks
        entries={entries}
        all={entries}
        photoNumber={() => 1}
        repeated={repeats(entries)}
        busy={false}
        {...handlers}
        {...props}
      />
    </MemoryRouter>,
  )
  return handlers
}

describe('what each book adds', () => {
  it('says an issue for a single', () => {
    show([single])
    expect(screen.getByText('Adds issue #7 to Saga')).toBeVisible()
  })

  it('says a book for a collected book on a title that exists', () => {
    show([bare])
    expect(screen.getByText('Adds a book to Saga')).toBeVisible()
  })

  it('says a new title when the commit will start one', () => {
    show([fresh])
    expect(screen.getByText('Starts a new title: Hidden Run')).toBeVisible()
  })

  it('falls back to the title when the server sent no plan', () => {
    const old = { ...bare }
    delete old.adds
    show([old])
    expect(screen.getByText('Adds to Saga')).toBeVisible()
  })
})

describe('the format of a collected book', () => {
  it('offers the five kinds, set from the entry', async () => {
    const user = userEvent.setup()
    const { onSave } = show([held])
    const select = screen.getByLabelText('Format')
    expect(select).toHaveValue('hardcover')
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Trade paperback',
      'Hardcover',
      'Omnibus',
      'Compendium',
      'Original graphic novel',
    ])
    await user.selectOptions(select, 'ogn')
    expect(onSave).toHaveBeenCalledWith(expect.anything(), {
      edition_kind: 'ogn',
    })
  })

  it('shows a refusal of the kind beside the field', () => {
    show([held], {
      errors: { [held.id]: { field: 'edition_kind', message: 'Not a kind.' } },
    })
    expect(screen.getByText('Not a kind.')).toBeVisible()
    expect(screen.getByLabelText('Format')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  it('has no format, line number or contents for a single', () => {
    show([single])
    expect(screen.queryByLabelText('Format')).toBeNull()
    expect(screen.queryByLabelText('Number in the line')).toBeNull()
    expect(screen.queryByText('Contents')).toBeNull()
  })
})

describe('the number in the line', () => {
  it('starts from the saved number and saves a new one on leaving', async () => {
    const user = userEvent.setup()
    const { onSave } = show([held])
    const field = screen.getByLabelText('Number in the line')
    expect(field).toHaveValue('2')
    await user.clear(field)
    await user.type(field, '5')
    await user.tab()
    expect(onSave).toHaveBeenCalledWith(expect.anything(), { line_number: 5 })
  })

  it('saves a blank as none, and says nothing for an unchanged one', async () => {
    const user = userEvent.setup()
    const { onSave } = show([held, bare])
    await user.clear(screen.getAllByLabelText('Number in the line')[0])
    await user.tab()
    expect(onSave).toHaveBeenCalledWith(expect.anything(), {
      line_number: null,
    })
    onSave.mockClear()
    await user.click(screen.getAllByLabelText('Number in the line')[1])
    await user.tab()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('refuses a number it cannot save, before asking the server', async () => {
    const user = userEvent.setup()
    const { onSave } = show([bare])
    const field = screen.getByLabelText('Number in the line')
    await user.type(field, '0')
    await user.tab()
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Whole numbers from 1 to 9999 only.')).toBeVisible()
    expect(field).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows the server refusal beside the field, not under the selects', () => {
    show([held], {
      errors: {
        [held.id]: {
          field: 'line_number',
          message: 'The number in the line is a whole number.',
        },
      },
    })
    const field = screen.getByLabelText('Number in the line')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(
      within(field.closest('.intake-book-field')).getByText(
        'The number in the line is a whole number.',
      ),
    ).toBeVisible()
  })
})

describe('the contents of a collected book', () => {
  it('lists each line, and says which will count toward the run', () => {
    show([held])
    const list = screen.getByRole('list', { name: 'Contents' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Saga · #7-12')
    expect(items[0]).toHaveTextContent('will count toward the run')
    expect(items[1]).toHaveTextContent('Saga · Annual #1')
    expect(items[1]).not.toHaveTextContent('will count toward the run')
  })

  it('says nothing was read when the list is empty', () => {
    show([fresh])
    expect(
      screen.getByText(
        'Nothing read yet - you can add contents on the book’s page after',
      ),
    ).toBeVisible()
    expect(screen.queryByRole('list', { name: 'Contents' })).toBeNull()
  })
})

describe('the already-have-it warning', () => {
  it('names the book and links to its page, without blocking', () => {
    show([held])
    const line = screen.getByText(/You already have/).closest('p')
    expect(line).toHaveTextContent(
      'You already have Saga, Book Two with these issues. Adding it makes a second book.',
    )
    expect(
      within(line).getByRole('link', { name: 'Saga, Book Two' }),
    ).toHaveAttribute('href', `/admin/shelf/comics/${held.adds.title_id}/vol-2`)
    expect(screen.getByRole('checkbox')).toBeEnabled()
  })

  it('names it as text when the page cannot be found', () => {
    const noIds = {
      ...held,
      adds: { ...held.adds, title_id: null },
    }
    show([noIds])
    const line = screen.getByText(/You already have/).closest('p')
    expect(within(line).queryByRole('link')).toBeNull()
    expect(line).toHaveTextContent('You already have Saga, Book Two')
  })

  it('is absent when nothing is held', () => {
    show([bare])
    expect(screen.queryByText(/You already have/)).toBeNull()
  })
})
