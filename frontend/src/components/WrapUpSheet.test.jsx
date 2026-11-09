import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WrapUpSheet from './WrapUpSheet.jsx'
import { apiFetch } from '../lib/api.js'
import { ACTION_ERROR } from '../content/status.js'
import { localToday } from '../lib/statusMoves.js'

vi.mock('../lib/api.js', () => ({ apiFetch: vi.fn() }))

const ITEM = { id: 'h2', title: 'Hades II', cover_url: null, type: 'game' }
const DETAIL = {
  id: 'h2',
  title: 'Hades II',
  rating: 8,
  playthroughs: [
    {
      number: 1,
      started_on: '2025-01-01',
      outcome: 'finished',
      journal_minutes: 0,
    },
    {
      number: 2,
      started_on: '2026-10-24',
      outcome: null,
      journal_minutes: 1872,
    },
  ],
}

function mockApi(routes = {}) {
  vi.mocked(apiFetch).mockImplementation(async (path, options = {}) => {
    const key = `${options.method ?? 'GET'} ${path}`
    const answer = key in routes ? routes[key] : { ok: true, body: {} }
    if (answer instanceof Error) throw answer
    return {
      ok: answer.ok,
      status: answer.status ?? (answer.ok ? 200 : 500),
      json: async () => answer.body,
    }
  })
}

function calls(method, path) {
  return vi
    .mocked(apiFetch)
    .mock.calls.filter(
      ([p, options = {}]) => p === path && (options.method ?? 'GET') === method,
    )
}

function body(call) {
  return JSON.parse(call[1].body)
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

afterEach(() => {
  delete HTMLDialogElement.prototype.showModal
  delete HTMLDialogElement.prototype.close
  vi.mocked(apiFetch).mockReset()
})

function renderSheet(props = {}) {
  const onClose = vi.fn()
  const onDone = vi.fn()
  const view = render(
    <WrapUpSheet
      subject={{ item: ITEM, preselect: 'finished' }}
      onClose={onClose}
      onDone={onDone}
      {...props}
    />,
  )
  return { ...view, onClose, onDone }
}

describe('WrapUpSheet', () => {
  it('opens on the preselected outcome with the run’s header and rating', async () => {
    mockApi({ 'GET /api/items/h2': { ok: true, body: DETAIL } })
    renderSheet({ subject: { item: ITEM, preselect: 'paused' } })
    const dialog = screen.getByRole('dialog', { name: 'Wrap up Hades II' })
    expect(dialog).toHaveAttribute('open')
    expect(
      await within(dialog).findByText(
        'Playthrough 2 · since Oct 24, 2026 · 31 h',
      ),
    ).toBeInTheDocument()
    const group = within(dialog).getByRole('group', { name: 'How did it end' })
    expect(
      within(group).getByRole('button', {
        name: 'Paused, keeps the date, I’ll be back',
      }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      within(group).getByRole('button', { name: 'Finished, dated today' }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(
      within(dialog).getByRole('button', { name: 'Mark paused' }),
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Paused on')).toHaveValue(localToday())
    await waitFor(() =>
      expect(
        within(dialog).getByRole('radio', { name: 'Clear rating' }),
      ).toHaveAttribute('aria-label', 'Clear rating'),
    )
  })

  it('follows the chosen outcome in the primary label and the date label', async () => {
    mockApi()
    renderSheet()
    await userEvent.click(
      screen.getByRole('button', { name: 'Abandoned, closes the run' }),
    )
    expect(
      screen.getByRole('button', { name: 'Mark abandoned' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Abandoned on')).toBeInTheDocument()
  })

  it('Skip extras posts the outcome and today only', async () => {
    mockApi({ 'GET /api/items/h2': { ok: true, body: DETAIL } })
    const { onDone } = renderSheet()
    await screen.findByText(/Playthrough 2/)
    await userEvent.type(screen.getByLabelText('One line'), 'ignored')
    await userEvent.click(screen.getByRole('button', { name: 'Skip extras' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(body(calls('POST', '/api/items/h2/status')[0])).toEqual({
      status: 'finished',
      today: localToday(),
    })
    expect(calls('PATCH', '/api/items/h2')).toHaveLength(0)
    expect(onDone).toHaveBeenCalledWith({
      item: ITEM,
      status: 'finished',
      rating: 8,
      ratingFailed: false,
    })
  })

  it('the primary posts the date and the note, then the rating only when changed', async () => {
    mockApi({ 'GET /api/items/h2': { ok: true, body: DETAIL } })
    const { onDone } = renderSheet()
    await screen.findByText(/Playthrough 2/)
    await userEvent.type(
      screen.getByLabelText('One line'),
      ' Better than the first. ',
    )
    const date = screen.getByLabelText('Finished on')
    await userEvent.clear(date)
    await userEvent.type(date, '2026-11-05')
    await userEvent.click(
      screen.getByRole('radio', { name: 'Rate 9 out of 10' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Mark finished' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(body(calls('POST', '/api/items/h2/status')[0])).toEqual({
      status: 'finished',
      today: localToday(),
      on: '2026-11-05',
      note: 'Better than the first.',
    })
    expect(body(calls('PATCH', '/api/items/h2')[0])).toEqual({ rating: 9 })
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ rating: 9, ratingFailed: false }),
    )
  })

  it('leaves today’s date and an unchanged rating out of the body', async () => {
    mockApi({ 'GET /api/items/h2': { ok: true, body: DETAIL } })
    const { onDone } = renderSheet()
    await screen.findByText(/Playthrough 2/)
    await userEvent.click(screen.getByRole('button', { name: 'Mark finished' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(body(calls('POST', '/api/items/h2/status')[0])).toEqual({
      status: 'finished',
      today: localToday(),
    })
    expect(calls('PATCH', '/api/items/h2')).toHaveLength(0)
  })

  it('keeps the sheet open with the server’s words when the status is refused', async () => {
    mockApi({
      'POST /api/items/h2/status': {
        ok: false,
        status: 422,
        body: { detail: '2026-11-20 has not happened yet.' },
      },
    })
    const { onDone } = renderSheet()
    await userEvent.click(screen.getByRole('button', { name: 'Mark finished' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'has not happened yet',
    )
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveAttribute('open')
  })

  it('reports a failed rating through onDone and still closes', async () => {
    mockApi({
      'GET /api/items/h2': { ok: true, body: DETAIL },
      'PATCH /api/items/h2': { ok: false },
    })
    const { onDone } = renderSheet()
    await screen.findByText(/Playthrough 2/)
    await userEvent.click(
      screen.getByRole('radio', { name: 'Rate 10 out of 10' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Mark finished' }))
    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith(
        expect.objectContaining({ rating: 8, ratingFailed: true }),
      ),
    )
  })

  it('shows a generic error when the network fails', async () => {
    mockApi({ 'POST /api/items/h2/status': new Error('offline') })
    renderSheet()
    await userEvent.click(screen.getByRole('button', { name: 'Skip extras' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(ACTION_ERROR)
  })

  it('Escape and the close button go through onClose', async () => {
    mockApi()
    const { onClose } = renderSheet()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    screen
      .getByRole('dialog')
      .dispatchEvent(new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('renders nothing inside while closed', () => {
    mockApi()
    renderSheet({ subject: null })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(apiFetch).not.toHaveBeenCalled()
  })
})
