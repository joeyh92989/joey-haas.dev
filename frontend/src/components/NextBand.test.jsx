import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import NextBand from './NextBand.jsx'

const renderBand = (next) =>
  render(
    <MemoryRouter>
      <NextBand next={next} />
    </MemoryRouter>,
  )

describe('NextBand', () => {
  it('links to What’s next with tonight and the counts', () => {
    renderBand({
      tonight: { up_next: null, picks: [{ title: 'Hades II' }] },
      buy_now: Array(11).fill({}),
      preorders: Array(9).fill({}),
    })
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/shelf/next')
    expect(link).toHaveTextContent('What’s next')
    expect(link).toHaveTextContent(
      'Tonight: Hades II · 11 in stores · 9 coming soon',
    )
  })

  it('leaves tonight out when nothing is picked', () => {
    renderBand({
      tonight: { up_next: null, picks: [] },
      buy_now: [{}],
      preorders: [],
    })
    const link = screen.getByRole('link')
    expect(link).toHaveTextContent('1 in stores · 0 coming soon')
    expect(link).not.toHaveTextContent('Tonight')
  })

  it('is hidden without data', () => {
    const { container } = renderBand(null)
    expect(container).toBeEmptyDOMElement()
  })
})
