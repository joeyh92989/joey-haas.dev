import '@testing-library/jest-dom'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JobStatusRow, { StatusText } from './JobStatusRow.jsx'

const job = (overrides) => ({
  key: 'radar',
  label: 'Radar',
  at: Date.parse('2026-10-05T00:44:00Z'),
  summary: 'Upcoming releases',
  state: 'ok',
  runNow: '/admin/radar',
  ...overrides,
})

function renderRow(props) {
  return render(
    <MemoryRouter>
      <ul>
        <JobStatusRow {...props} />
      </ul>
    </MemoryRouter>,
  )
}

describe('StatusText', () => {
  it.each(['ok', 'stale', 'failed', 'unknown'])(
    'says %s in words beside a hidden dot',
    (state) => {
      const { container } = render(<StatusText state={state} />)
      expect(screen.getByText(state)).toBeInTheDocument()
      const dot = container.querySelector('.status-dot')
      expect(dot).toHaveClass(state)
      expect(dot).toHaveAttribute('aria-hidden', 'true')
    },
  )
})

describe('JobStatusRow', () => {
  it('shows the time, label, summary, state and a named Open link, never Run now', () => {
    renderRow({ job: job({ state: 'stale' }) })
    const row = screen.getByRole('listitem')
    expect(row).toHaveTextContent('Radar')
    expect(row).toHaveTextContent('Upcoming releases')
    expect(row).toHaveTextContent('stale')
    expect(row).toHaveTextContent(/\d{1,2}:\d{2}/)
    expect(screen.getByRole('link', { name: 'Open Radar' })).toHaveAttribute(
      'href',
      '/admin/radar',
    )
  })

  it('shows a dash with no time and no link without a trigger', () => {
    renderRow({ job: job({ at: null, runNow: null, state: 'unknown' }) })
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('adds the extra after the summary', () => {
    renderRow({ job: job(), extra: ' · note' })
    expect(screen.getByText(/Upcoming releases · note/)).toBeInTheDocument()
  })
})

describe('JobStatusRow run now', () => {
  const run = { path: '/api/recommendations/generate', body: { kind: 'radar' } }
  const reply = (status, body = {}) => ({
    ok: status < 300,
    status,
    json: async () => body,
  })

  afterEach(() => vi.unstubAllGlobals())

  it('shows a Run now button beside the Open link', () => {
    renderRow({ job: job({ runWords: 'Open Radar' }), run })
    expect(screen.getByRole('button', { name: 'Run now: Radar' })).toBeEnabled()
    expect(screen.getByRole('link', { name: 'Open Radar' })).toHaveAttribute(
      'href',
      '/admin/radar',
    )
  })

  it('shows no button without a run', () => {
    renderRow({ job: job() })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('disables and marks the button busy while running, firing once', async () => {
    let finish
    const fetch = vi.fn(
      () => new Promise((resolve) => (finish = () => resolve(reply(200)))),
    )
    vi.stubGlobal('fetch', fetch)
    const onRan = vi.fn()
    renderRow({ job: job(), run, onRan })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Run now: Radar' }))
    const button = screen.getByRole('button', { name: /Running/ })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Running…')
    await user.click(button)
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => finish())
    expect(await screen.findByRole('status')).toHaveTextContent(/^Done, /)
    expect(onRan).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Run now: Radar' })).toBeEnabled()
  })

  it('announces a failure in an alert with the error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reply(502, { detail: 'IGDB is not configured' })),
    )
    renderRow({ job: job(), run, onRan: vi.fn() })
    await userEvent.click(screen.getByRole('button', { name: /Run now/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed: IGDB is not configured',
    )
  })

  it('reads a 409 as Already running', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reply(409)),
    )
    renderRow({ job: job(), run, onRan: vi.fn() })
    await userEvent.click(screen.getByRole('button', { name: /Run now/ }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Already running'),
    )
  })
})
