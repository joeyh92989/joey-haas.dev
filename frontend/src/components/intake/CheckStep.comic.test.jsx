import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CheckStep from './CheckStep.jsx'

const apiFetch = vi.fn()
vi.mock('../../lib/api.js', () => ({
  API_URL: '',
  apiFetch: (...args) => apiFetch(...args),
  errorMessage: vi.fn(async () => 'refused'),
}))

const chosen = {
  external_source: 'comicvine',
  external_id: '1',
  title: 'Waterworld: Children of Leviathan',
  issue_count: 4,
}

const book = (n, number) => ({
  id: `e${n}`,
  photo_id: `p${n}`,
  kind: 'comic',
  state: 'exact',
  chosen,
  candidates: [chosen],
  payload: {
    detected_title: 'Waterworld',
    issue_number: number,
    number_source: number == null ? 'none' : 'read',
    format: 'single',
  },
  number_check: { state: number == null ? 'none' : 'in_run', run: 4 },
  on_shelf: null,
})

function sitting(entries, kind = 'comic') {
  return {
    id: 's1',
    area: 'shelf',
    kind,
    photos: entries.map((entry) => ({ id: entry.photo_id })),
    entries,
  }
}

function step(entries, props = {}) {
  const onNext = vi.fn()
  const onEntry = vi.fn()
  render(
    <CheckStep
      sitting={sitting(entries, props.kind)}
      onEntry={onEntry}
      onBack={vi.fn()}
      onNext={onNext}
      next="Details"
      headingRef={{ current: null }}
    />,
  )
  return { onNext, onEntry }
}

beforeEach(() => {
  apiFetch.mockReset()
})

describe('CheckStep in a comic sitting', () => {
  it('lists four Waterworld photos as four books and one line of what they add', () => {
    step([book(1, 1), book(2, 2), book(3, 3), book(4, 4)])
    expect(screen.getAllByLabelText('Issue number')).toHaveLength(4)
    expect(screen.getByText('adds #1–4')).toBeVisible()
    expect(screen.getByRole('button', { name: /Details/ })).toBeEnabled()
  })

  it('holds Next until every kept single book has a number', async () => {
    const user = userEvent.setup()
    const { onNext } = step([book(1, 1), book(2, null)])
    const next = screen.getByRole('button', { name: /Details/ })
    expect(next).toBeDisabled()
    expect(screen.getByText('1 book needs a number first.')).toBeVisible()
    await user.click(next)
    expect(onNext).not.toHaveBeenCalled()
  })

  it('does not hold Next for a book unticked, or a collected edition', () => {
    const collected = book(2, null)
    collected.payload.format = 'collected'
    const off = {
      ...book(3, null),
      state: 'ignored',
      payload: { ...book(3, null).payload, unticked: true, was: 'exact' },
    }
    step([book(1, 1), collected, off])
    expect(screen.getByRole('button', { name: /Details/ })).toBeEnabled()
  })

  it('saves a typed number onto the entry and shows what the server answers', async () => {
    const user = userEvent.setup()
    const answered = { ...book(2, 2), number_check: { state: 'typed', run: 4 } }
    apiFetch.mockResolvedValue({ ok: true, json: async () => answered })
    const { onEntry } = step([book(1, 1), book(2, null)])
    const row = screen.getAllByRole('listitem')[1]
    await user.type(within(row).getByLabelText('Issue number'), '2')
    await user.tab()
    expect(apiFetch).toHaveBeenCalledTimes(1)
    const [url, init] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/intake/entries/e2')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body).payload).toMatchObject({
      detected_title: 'Waterworld',
      issue_number: 2,
    })
    expect(onEntry).toHaveBeenCalledWith(answered)
  })

  it('shows the server’s refusal when a number is refused', async () => {
    const user = userEvent.setup()
    apiFetch.mockResolvedValue({ ok: false })
    step([book(1, null)])
    await user.type(screen.getByLabelText('Issue number'), '3')
    await user.tab()
    expect(await screen.findByRole('alert')).toHaveTextContent('refused')
  })

  it('leaves a mixed sitting as it was: a grid to skim, no number fields', () => {
    step([book(1, null)], { kind: null })
    expect(screen.queryByLabelText('Issue number')).toBeNull()
    expect(screen.getByRole('button', { name: /Details/ })).toBeEnabled()
  })

  it('keeps focus on the next field while a number is saving', async () => {
    const user = userEvent.setup()
    apiFetch.mockReturnValue(new Promise(() => {})) // never answers
    step([book(1, null), book(2, null)])
    const [first, second] = screen.getAllByRole('listitem')
    await user.type(within(first).getByLabelText('Issue number'), '1')
    await user.tab()
    // The save is out, and the next row is still there to take the keys.
    expect(apiFetch).toHaveBeenCalledTimes(1)
    const next = within(second).getByRole('checkbox')
    expect(next).toBeEnabled()
    expect(next).toHaveFocus()
    expect(within(first).getByLabelText('Issue number')).toBeEnabled()
    // And the field the person goes on to accepts typing at once.
    const field = within(second).getByLabelText('Issue number')
    await user.click(field)
    await user.keyboard('2')
    expect(field).toHaveValue('2')
  })

  it('saves two quick edits of one book one after the other, each on the last', async () => {
    const user = userEvent.setup()
    const saved = { ...book(1, 3), number_check: { state: 'typed', run: 4 } }
    saved.payload = { ...saved.payload, number_source: 'typed' }
    let answerFirst
    apiFetch
      .mockReturnValueOnce(
        new Promise((resolve) => {
          answerFirst = () => resolve({ ok: true, json: async () => saved })
        }),
      )
      .mockResolvedValueOnce({ ok: true, json: async () => saved })
    step([book(1, null)])
    await user.type(screen.getByLabelText('Issue number'), '3')
    await user.tab()
    await user.selectOptions(
      screen.getByLabelText('This book is'),
      'A collected edition',
    )
    // The second waits for the first: only one request is out.
    expect(apiFetch).toHaveBeenCalledTimes(1)
    answerFirst()
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2))
    const bodies = apiFetch.mock.calls.map(
      ([, init]) => JSON.parse(init.body).payload,
    )
    expect(bodies[0].issue_number).toBe(3)
    expect(bodies[1]).toMatchObject({ issue_number: 3, format: 'collected' })
  })

  it('shows the server’s refusal beside the field it names', async () => {
    const user = userEvent.setup()
    apiFetch.mockResolvedValue({
      ok: false,
      clone: () => ({
        json: async () => ({
          detail: { field: 'issue_number', message: 'Refused by the server.' },
        }),
      }),
    })
    step([book(1, null)])
    const field = screen.getByLabelText('Issue number')
    await user.type(field, '5')
    await user.tab()
    const message = await screen.findByText('Refused by the server.')
    expect(message).toBeVisible()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field.getAttribute('aria-describedby')).toContain(message.id)
    // Beside the field, not as the page's alert.
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
