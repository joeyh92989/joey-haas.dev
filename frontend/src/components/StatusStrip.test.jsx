import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StatusStrip from './StatusStrip.jsx'

const NOW = Date.parse('2026-10-21T12:00:00Z')

const STATUS = {
  refreshed_at: '2026-10-21T00:21:00Z',
  titles: 5724,
  platforms: 2,
  stores_watched: 12,
  listings: 1958,
}

const NEXT = { generated_at: { picks: '2026-10-21', discover: '2026-10-18' } }

describe('StatusStrip', () => {
  it('renders nothing without a status', () => {
    const { container } = render(<StatusStrip status={null} next={NEXT} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the five cells', () => {
    render(<StatusStrip status={STATUS} next={NEXT} now={NOW} />)

    const terms = screen.getAllByRole('term').map((term) => term.textContent)
    expect(terms).toEqual([
      'Last refreshed',
      'Catalog',
      'Stores watched',
      'Picks',
      'Discover',
    ])
    const values = screen
      .getAllByRole('definition')
      .map((value) => value.textContent)
    expect(values[0]).toMatch(/21 Oct, 00:21 UTC$/)
    expect(values.slice(1)).toEqual([
      '5,724 titles2 platforms',
      '121,958 listings',
      'Oct 21, 2026',
      'Oct 18, 2026',
    ])
  })

  it('names the dot fresh within a day and a half', () => {
    render(<StatusStrip status={STATUS} next={NEXT} now={NOW} />)
    expect(
      screen.getByRole('img', { name: 'refreshed in the last 36 hours' }),
    ).toBeInTheDocument()
  })

  it('names the dot stale after that, or with no refresh at all', () => {
    const later = NOW + 2 * 24 * 3600 * 1000
    const { rerender } = render(
      <StatusStrip status={STATUS} next={NEXT} now={later} />,
    )
    expect(
      screen.getByRole('img', { name: 'not refreshed in over 36 hours' }),
    ).toBeInTheDocument()

    rerender(
      <StatusStrip
        status={{ ...STATUS, refreshed_at: null }}
        next={null}
        now={NOW}
      />,
    )
    expect(
      screen.getByRole('img', { name: 'not refreshed in over 36 hours' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(3)
  })
})
