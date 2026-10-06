import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'
import NextBand from './NextBand.jsx'

vi.mock('../lib/useSnapshotThenLive.js', () => ({
  useSnapshotThenLive: vi.fn(),
}))

const renderBand = () =>
  render(
    <MemoryRouter>
      <NextBand />
    </MemoryRouter>,
  )

describe('NextBand', () => {
  it('links to What’s next with tonight and the counts', () => {
    vi.mocked(useSnapshotThenLive).mockReturnValue({
      data: {
        tonight: { up_next: null, picks: [{ title: 'Hades II' }] },
        buy_now: Array(11).fill({}),
        preorders: Array(9).fill({}),
      },
    })
    renderBand()
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/spine/next')
    expect(link).toHaveTextContent('What’s next')
    expect(link).toHaveTextContent(
      'Tonight: Hades II · 11 to buy · 9 pre-orders',
    )
    expect(useSnapshotThenLive).toHaveBeenCalledWith('next')
  })

  it('leaves tonight out when nothing is picked', () => {
    vi.mocked(useSnapshotThenLive).mockReturnValue({
      data: {
        tonight: { up_next: null, picks: [] },
        buy_now: [{}],
        preorders: [],
      },
    })
    renderBand()
    const link = screen.getByRole('link')
    expect(link).toHaveTextContent('1 to buy · 0 pre-orders')
    expect(link).not.toHaveTextContent('Tonight')
  })

  it('is hidden without data', () => {
    vi.mocked(useSnapshotThenLive).mockReturnValue({ data: null })
    const { container } = renderBand()
    expect(container).toBeEmptyDOMElement()
  })
})
