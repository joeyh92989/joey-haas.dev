import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { entry } from '../../lib/intake.test-util.js'
import DetailsStep from './DetailsStep.jsx'

const apiFetch = vi.fn()
vi.mock('../../lib/api.js', () => ({
  API_URL: '',
  apiFetch: (...args) => apiFetch(...args),
  errorMessage: vi.fn(async () => 'refused'),
}))

const KINDS = [{ key: 'comic', label: 'Comic', fields: [] }]

function step(payload) {
  const e = entry('e1', 'ready', {
    kind: 'comic',
    chosen: { title: 'Saga', year: 2012 },
    payload: { shelf_format: 'trades', ...payload },
  })
  return (
    <DetailsStep
      sitting={{ entries: [e] }}
      kinds={KINDS}
      onEntry={vi.fn()}
      refusals={{}}
      onCommit={vi.fn()}
      onLater={vi.fn()}
      onBack={vi.fn()}
      committing={false}
      target="the shelf"
      headingRef={{ current: null }}
    />
  )
}

const VOL1 = { kind: 'Trade', label: 'Vol. 1', from: 1, to: 6 }

describe('DetailsStep collected books', () => {
  beforeEach(() => apiFetch.mockReset())

  it('shows the new books when the payload changes from outside', async () => {
    const user = userEvent.setup()
    const { rerender } = render(step({}))
    const row = screen.getByRole('group', { name: 'Saga' })
    await user.click(within(row).getByRole('button', { name: 'Add a book' }))
    await user.type(within(row).getByLabelText('Kind, book 1'), 'Omni')
    rerender(step({ books: [VOL1] }))
    expect(within(row).getByLabelText('Label, Vol. 1')).toHaveValue('Vol. 1')
    expect(within(row).queryByLabelText('Kind, book 1')).toBeNull()
  })

  it('saves the rows as `books`, never `editions`', async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
    const user = userEvent.setup()
    render(step({}))
    const row = screen.getByRole('group', { name: 'Saga' })
    await user.click(within(row).getByRole('button', { name: 'Add a book' }))
    await user.type(within(row).getByLabelText('Kind, book 1'), 'Trade')
    await user.type(within(row).getByLabelText('Label, book 1'), 'Vol. 1')
    await user.type(within(row).getByLabelText('From issue, Vol. 1'), '1')
    await user.type(within(row).getByLabelText('To issue, Vol. 1'), '6')
    await user.click(document.body)
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalled())
    const [, init] = apiFetch.mock.calls.at(-1)
    const sent = JSON.parse(init.body).payload
    expect(sent.books).toEqual([VOL1])
    expect(sent).not.toHaveProperty('editions')
  })

  it('reads books typed as `editions` before, and sends them as `books`', async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
    const user = userEvent.setup()
    render(step({ editions: [VOL1] }))
    const row = screen.getByRole('group', { name: 'Saga' })
    expect(within(row).getByLabelText('Label, Vol. 1')).toHaveValue('Vol. 1')
    await user.clear(within(row).getByLabelText('Label, Vol. 1'))
    await user.type(within(row).getByLabelText('Label, book 1'), 'Vol. 1b')
    await user.click(document.body)
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalled())
    const sent = JSON.parse(apiFetch.mock.calls.at(-1)[1].body).payload
    expect(sent.books).toEqual([{ ...VOL1, label: 'Vol. 1b' }])
    expect(sent).not.toHaveProperty('editions')
  })

  it('is not offered on a photographed collected book: it is a volume already', () => {
    render(step({ format: 'collected' }))
    expect(screen.queryByText('Collected books')).toBeNull()
  })
})

describe('DetailsStep comic fields', () => {
  it('does not ask for the issues: Check has each book’s number', () => {
    const kinds = [
      {
        key: 'comic',
        label: 'Comic',
        fields: [
          {
            key: 'issues_owned',
            label: 'Issues owned',
            control: 'text',
            options: [],
            per_item: true,
            in_details: false,
          },
          {
            key: 'shelf_format',
            label: 'Shelf format',
            control: 'select',
            options: ['singles', 'trades'],
            per_item: false,
            in_details: true,
          },
        ],
      },
    ]
    const e = entry('e1', 'ready', {
      kind: 'comic',
      chosen: { title: 'Saga' },
      payload: { issue_number: 3 },
    })
    render(
      <DetailsStep
        sitting={{ entries: [e] }}
        kinds={kinds}
        onEntry={vi.fn()}
        refusals={{}}
        onCommit={vi.fn()}
        onLater={vi.fn()}
        onBack={vi.fn()}
        committing={false}
        target="the shelf"
        headingRef={{ current: null }}
      />,
    )
    expect(screen.queryByLabelText('Issues owned')).toBeNull()
    expect(screen.getAllByLabelText('Shelf format').length).toBeGreaterThan(0)
  })
})
