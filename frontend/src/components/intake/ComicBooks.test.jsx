import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { repeats } from '../../lib/comicBooks.js'
import ComicBooks from './ComicBooks.jsx'

const chosen = {
  external_source: 'comicvine',
  external_id: '1',
  title: 'Waterworld: Children of Leviathan',
  year: 1997,
  publisher: 'Acclaim Comics',
}

const book = (id, number, source = 'read', extra = {}) => ({
  id,
  photo_id: `p${id}`,
  kind: 'comic',
  state: 'exact',
  chosen,
  payload: {
    detected_title: 'WATERWORLD CHILDREN OF LEVIATHAN',
    issue_number: number,
    number_source: number == null ? 'none' : source,
    format: 'single',
  },
  number_check: {
    state: number == null ? 'none' : source === 'typed' ? 'typed' : 'in_run',
    run: 4,
  },
  on_shelf: null,
  ...extra,
})

function show(entries, props = {}) {
  const handlers = {
    onToggle: vi.fn(),
    onRemove: vi.fn(),
    onSave: vi.fn().mockResolvedValue(true),
  }
  render(
    <ComicBooks
      entries={entries}
      all={entries}
      photoNumber={(entry) => Number(entry.id)}
      repeated={repeats(entries)}
      busy={false}
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

describe('ComicBooks', () => {
  it('shows each book with its number and the mark the server decided', () => {
    show([book('1', 1), book('2', null), book('3', 3, 'typed')])
    const rows = screen.getAllByRole('listitem').slice(0, 3)
    expect(within(rows[0]).getByLabelText('Issue number')).toHaveValue('1')
    expect(
      within(rows[0]).getByText('Read from the cover. In the run.'),
    ).toBeVisible()
    expect(within(rows[1]).getByLabelText('Issue number')).toHaveValue('')
    expect(
      within(rows[1]).getByText('Couldn’t read the number. Type it.'),
    ).toBeVisible()
    expect(within(rows[2]).getByText('Typed.')).toBeVisible()
  })

  it('sums four books into one line for their series', () => {
    show([1, 2, 3, 4].map((n) => book(String(n), n)))
    expect(screen.getByText('adds #1–4')).toBeVisible()
    expect(document.querySelector('.intake-adds-title')).toHaveTextContent(
      'Waterworld: Children of Leviathan',
    )
  })

  it('says a book still needs a number, in the sum', () => {
    show([book('1', 1), book('2', null)])
    expect(screen.getByText(/1 book needs a number/)).toBeVisible()
  })

  it('saves a typed number when the field loses focus', async () => {
    const user = userEvent.setup()
    const { onSave } = show([book('1', null)])
    await user.type(screen.getByLabelText('Issue number'), '#3')
    expect(onSave).not.toHaveBeenCalled()
    await user.tab()
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }), {
      issue_number: 3,
    })
  })

  it('refuses a number out of range without asking the server', async () => {
    const user = userEvent.setup()
    const { onSave } = show([book('1', 2)])
    const field = screen.getByLabelText('Issue number')
    await user.clear(field)
    await user.type(field, '0')
    await user.tab()
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Whole numbers from 1 to 9999 only.')).toBeVisible()
    expect(field).toHaveAttribute('aria-invalid', 'true')
  })

  it('flags the second book of a series and number', () => {
    show([book('1', 2), book('2', 2)])
    expect(screen.getAllByText('Already in this sitting')).toHaveLength(1)
    const second = screen.getAllByRole('listitem')[1]
    expect(within(second).getByText('Already in this sitting')).toBeVisible()
  })

  it('shows a collected book as a range and an edition kind', async () => {
    const user = userEvent.setup()
    const collected = book('1', null, 'read', {
      payload: {
        detected_title: 'Saga',
        issue_number: null,
        format: 'collected',
        edition_kind: 'trade',
        collects_from: 1,
        collects_to: 6,
      },
    })
    const { onSave } = show([collected])
    expect(screen.queryByLabelText('Issue number')).toBeNull()
    expect(screen.getByLabelText('First issue collected')).toHaveValue('1')
    expect(screen.getByLabelText('Edition')).toHaveValue('trade')
    expect(
      screen.getByText('adds Saga (Trade, #1–6)', { exact: false }),
    ).toBeVisible()
    await user.selectOptions(screen.getByLabelText('Edition'), 'omnibus')
    expect(onSave).toHaveBeenCalledWith(expect.anything(), {
      edition_kind: 'omnibus',
    })
  })

  it('saves a collected range only when both ends are in order', async () => {
    const user = userEvent.setup()
    const collected = book('1', null, 'read', {
      payload: { detected_title: 'Saga', format: 'collected' },
    })
    const { onSave } = show([collected])
    await user.type(screen.getByLabelText('First issue collected'), '6')
    await user.type(screen.getByLabelText('Last issue collected'), '1')
    await user.tab()
    expect(onSave).not.toHaveBeenCalled()
    expect(
      screen.getByText('Give the first and the last issue, first to last.'),
    ).toBeVisible()
  })

  it('lets the format be changed, and a book be unticked or removed', async () => {
    const user = userEvent.setup()
    const { onSave, onToggle, onRemove } = show([book('1', 2)])
    await user.selectOptions(
      screen.getByLabelText('This book is'),
      'A collected edition',
    )
    expect(onSave).toHaveBeenCalledWith(expect.anything(), {
      format: 'collected',
    })
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Add this book: Waterworld: Children of Leviathan #2',
      }),
    )
    expect(onToggle).toHaveBeenCalledWith(expect.anything(), false)
    await user.click(
      screen.getByRole('button', {
        name: 'Remove Waterworld: Children of Leviathan',
      }),
    )
    expect(onRemove).toHaveBeenCalled()
  })

  it('says what a series already holds', () => {
    const on_shelf = { owned_text: '1–4' }
    show([
      book('1', 4, 'read', { on_shelf }),
      book('2', 5, 'read', { on_shelf }),
    ])
    expect(screen.getByText(/adds #5/)).toBeVisible()
    expect(screen.getByText(/#4 already on the shelf/)).toBeVisible()
  })
})
