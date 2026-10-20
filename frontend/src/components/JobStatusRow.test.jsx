import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
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
  it('shows the time, label, summary, state and a named Run now', () => {
    renderRow({ job: job({ state: 'stale' }) })
    const row = screen.getByRole('listitem')
    expect(row).toHaveTextContent('Radar')
    expect(row).toHaveTextContent('Upcoming releases')
    expect(row).toHaveTextContent('stale')
    expect(row).toHaveTextContent(/\d{2}:\d{2}/)
    expect(
      screen.getByRole('link', { name: 'Run now: Radar' }),
    ).toHaveAttribute('href', '/admin/radar')
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
