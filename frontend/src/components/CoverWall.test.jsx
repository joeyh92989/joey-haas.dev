import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import CoverWall from './CoverWall.jsx'

const SERIES = { id: 'abc', title: 'Saga' }

function detail(comic = {}) {
  return {
    id: 'abc',
    title: 'Saga',
    comic: {
      owned_text: '',
      released: 20,
      read_to: null,
      next_issue: null,
      ...comic,
    },
  }
}

const issuesTo = (n) =>
  Array.from({ length: n }, (_, i) => ({
    number: String(i + 1),
    name: null,
    store_date: '2020-01-01',
    cover_url: `https://example.test/${i + 1}.jpg`,
  }))

function show(wall, item, props = {}) {
  return render(
    <MemoryRouter>
      <CoverWall wall={wall} detail={item} series={SERIES} {...props} />
    </MemoryRouter>,
  )
}

describe('CoverWall', () => {
  it('folds a long missing stretch behind a button that opens 12 tiles and folds back', async () => {
    const user = userEvent.setup()
    show(
      { series_title: 'Saga', issues: issuesTo(20), editions: [] },
      detail({ owned_text: '13–20' }),
    )
    expect(
      screen.getByRole('heading', { name: 'Every book in the run' }),
    ).toBeInTheDocument()
    const stack = screen.getByRole('button', {
      name: '#1–12 · 12 missing · Show covers',
    })
    expect(stack).toHaveAttribute('aria-expanded', 'false')
    await user.click(stack)

    const fold = screen.getByRole('button', { name: 'Fold these back up' })
    expect(fold).toHaveAttribute('aria-expanded', 'true')
    const missing = screen.getAllByRole('link', { name: /, Missing$/ })
    expect(missing).toHaveLength(12)
    await user.click(fold)
    expect(
      screen.getByRole('button', { name: '#1–12 · 12 missing · Show covers' }),
    ).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryAllByRole('link', { name: /, Missing$/ })).toHaveLength(
      0,
    )
  })

  it('draws a book tile for an edition and a not-out block for the next dated issue', () => {
    show(
      {
        series_title: 'Saga',
        issues: issuesTo(6),
        editions: [
          {
            slug: 'ed-1-6',
            kind: 'TPB',
            label: 'Volume One',
            from_issue: 1,
            to_issue: 6,
            cover_url: null,
          },
        ],
      },
      detail({
        owned_text: '1–6',
        released: 6,
        editions: [],
        next_issue: { number: '7', store_date: '2099-01-01' },
      }),
    )
    expect(
      screen.getByRole('link', { name: 'Volume One, collects #1–6' }),
    ).toBeInTheDocument()
    expect(screen.getByText('#7')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /#7/ })).toBeNull()
  })

  it('ignores Comic Vine rows past the run: no tile, no link', () => {
    show(
      { series_title: 'Saga', issues: issuesTo(40), editions: [] },
      detail({
        owned_text: '1–5',
        released: 5,
        next_issue: { number: '6', store_date: '2099-01-01' },
      }),
    )
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(5)
    expect(screen.queryByRole('link', { name: /#6,/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /#7,/ })).toBeNull()
    expect(screen.queryByText('#20')).toBeNull()
  })

  it('names the marks in a key', () => {
    show(
      { series_title: 'Saga', issues: issuesTo(3), editions: [] },
      detail({ owned_text: '1–3', released: 3 }),
    )
    const key = screen.getByRole('list', { name: 'Key' })
    expect(within(key).getByText('Missing')).toBeInTheDocument()
  })
})

describe('CoverWall key words', () => {
  it('words the key pills verbatim', () => {
    render(
      <MemoryRouter>
        <CoverWall
          wall={{ series_title: 'Saga', issues: issuesTo(3), editions: [] }}
          detail={detail({ owned_text: '1–3', released: 3 })}
          series={SERIES}
          skipped={new Set([2])}
        />
      </MemoryRouter>,
    )
    const key = screen.getByRole('list', { name: 'Key' })
    for (const word of [
      'Read ✓',
      'Owned',
      'Missing',
      'Not out yet',
      'Skipped · private',
    ])
      expect(within(key).getByText(word)).toBeInTheDocument()
  })
})

describe('CoverWall show chips and marks', () => {
  const marked = (n, owned, read) =>
    issuesTo(n).map((row, i) => ({
      ...row,
      owned: owned.includes(i + 1),
      read: read.includes(i + 1),
    }))

  it('draws even when nothing is held, with Show All and Missing counts', () => {
    show(
      { series_title: 'Tales', issues: issuesTo(5), editions: [] },
      detail({ owned_text: '', released: 5 }),
    )
    const group = screen.getByRole('group', { name: 'Show' })
    expect(
      within(group).getByRole('button', { name: 'All 5' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      within(group).getByRole('button', { name: 'Missing 5' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /, Missing$/ })).toHaveLength(5)
  })

  it('Missing shows only the missing covers, with its own empty line', async () => {
    const user = userEvent.setup()
    show(
      { series_title: 'Saga', issues: marked(4, [1, 2, 3], [1]), editions: [] },
      detail({ owned_text: '', released: 4 }),
    )
    await user.click(screen.getByRole('button', { name: 'Missing 1' }))
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Saga #4, Missing' })).toBeVisible()
  })

  it('says nothing is missing when the run is whole', async () => {
    const user = userEvent.setup()
    show(
      { series_title: 'Saga', issues: marked(2, [1, 2], []), editions: [] },
      detail({ owned_text: '', released: 2 }),
    )
    await user.click(screen.getByRole('button', { name: /^Missing/ }))
    expect(screen.getByText('Nothing missing from this run.')).toBeVisible()
  })

  it('reads owned and read one book at a time from the rows', () => {
    show(
      { series_title: 'Saga', issues: marked(3, [1, 2, 3], [2]), editions: [] },
      detail({ owned_text: '', released: 3 }),
    )
    expect(screen.getByRole('link', { name: 'Saga #1, Owned' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Saga #2, Read' })).toBeVisible()
  })

  it('draws a held book with no cover as a numbered blank', () => {
    show(
      {
        series_title: 'Saga',
        issues: [
          {
            number: 1,
            name: null,
            store_date: null,
            cover_url: null,
            owned: true,
            read: false,
          },
        ],
        editions: [],
      },
      detail({ owned_text: '', released: 1 }),
    )
    expect(screen.getByRole('link', { name: 'Saga #1, Owned' })).toBeVisible()
    expect(screen.getByText('#1')).toBeVisible()
  })

  it('signed out: no buttons on the covers and no status line', () => {
    show(
      { series_title: 'Saga', issues: marked(3, [1], []), editions: [] },
      detail({ owned_text: '', released: 3 }),
    )
    expect(screen.queryByRole('status')).toBeNull()
    expect(
      screen.queryByRole('button', { name: /Mark (owned|read|missing)/ }),
    ).toBeNull()
  })

  it('signed in: a long missing run stays open, and each cover is a button', () => {
    show(
      { series_title: 'Saga', issues: issuesTo(20), editions: [] },
      detail({ owned_text: '', released: 20 }),
      { onMark: async () => {}, skipped: new Set() },
    )
    expect(screen.queryByRole('button', { name: /Show covers/ })).toBeNull()
    expect(
      screen.getAllByRole('button', { name: /, Missing\. Mark owned$/ }),
    ).toHaveLength(20)
  })
})

describe('CoverWall Undo and focus', () => {
  const rows = (n, owned = []) =>
    issuesTo(n).map((row, i) => ({
      ...row,
      owned: owned.includes(i + 1),
      read: false,
    }))

  function owner(props = {}, comic = {}, issues = rows(4, [1])) {
    const onMark = vi.fn(async () => ({ previous: null }))
    show(
      { series_title: 'Saga', issues, editions: [] },
      detail({ owned_text: '', released: 4, ...comic }),
      { onMark, skipped: new Set(), ...props },
    )
    return onMark
  }

  it('Undo of a tap on a skipped cover puts the skip back', async () => {
    const user = userEvent.setup()
    const onMark = owner({ skipped: new Set([3]) })
    await user.click(
      screen.getByRole('button', { name: 'Saga #3, Skipped. Mark owned' }),
    )
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onMark).toHaveBeenNthCalledWith(1, 3, 'owned', {})
    expect(onMark).toHaveBeenNthCalledWith(2, 3, 'missing', {
      skip: true,
      restore: null,
    })
  })

  it('Undo of the first tap on a Want restores what the tap moved', async () => {
    const user = userEvent.setup()
    const onMark = vi.fn(async (n, state, undo) =>
      undo.restore ? {} : { previous: { owned_format: 'none' } },
    )
    show(
      { series_title: 'Saga', issues: rows(4), editions: [] },
      detail({ owned_text: '', released: 4 }),
      { onMark, skipped: new Set() },
    )
    await user.click(
      screen.getByRole('button', { name: 'Saga #2, Missing. Mark owned' }),
    )
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onMark).toHaveBeenLastCalledWith(2, 'missing', {
      skip: false,
      restore: { owned_format: 'none' },
    })
  })

  it('puts focus back on the cover button after Undo', async () => {
    const user = userEvent.setup()
    owner()
    await user.click(
      screen.getByRole('button', { name: 'Saga #3, Missing. Mark owned' }),
    )
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(
      screen.getByRole('button', { name: /^Saga #3, Missing/ }),
    ).toHaveFocus()
  })

  it('under Show: Missing moves focus to the next cover, or the heading', async () => {
    const user = userEvent.setup()
    owner({}, { released: 3 }, rows(3))
    await user.click(screen.getByRole('button', { name: /^Missing/ }))
    await user.click(
      screen.getByRole('button', { name: 'Saga #1, Missing. Mark owned' }),
    )
    expect(
      screen.getByRole('button', { name: /^Saga #2, Missing/ }),
    ).toHaveFocus()
    await user.click(
      screen.getByRole('button', { name: 'Saga #3, Missing. Mark owned' }),
    )
    expect(
      screen.getByRole('heading', { name: 'Every book in the run' }),
    ).toHaveFocus()
  })

  it('does not say the number opens the issue when the numbers are not links', () => {
    owner({ linked: false })
    expect(screen.queryByText(/The number opens the issue/)).toBeNull()
    expect(screen.getByText(/Tap a cover to mark it/)).toBeVisible()
    expect(screen.queryByRole('link', { name: /Open Saga/ })).toBeNull()
  })

  it('says it when the numbers are links', () => {
    owner()
    expect(screen.getByText(/The number opens the issue/)).toBeVisible()
  })
})
