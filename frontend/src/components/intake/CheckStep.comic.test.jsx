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

beforeEach(() => apiFetch.mockReset())

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
})
