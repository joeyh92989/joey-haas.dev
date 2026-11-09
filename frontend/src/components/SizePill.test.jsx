import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SizePill, { sizeLabel } from './SizePill.jsx'

describe('SizePill', () => {
  it.each([
    [2, 'Short'],
    [6, 'Short'],
    [6.5, 'Medium'],
    [15, 'Medium'],
    [15.5, 'Long'],
    [62, 'Long'],
  ])('puts %s h in the %s band, as the picker does', (hours, label) => {
    expect(sizeLabel(hours)).toBe(label)
  })

  it('shows the band as text and the hours to finish', () => {
    render(<SizePill hours={44.6} />)
    expect(screen.getByText('Long')).toHaveClass('size-pill')
    expect(screen.getByText('about 45 h to finish')).toBeInTheDocument()
  })

  it('shows nothing without hours', () => {
    const { container } = render(<SizePill hours={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it.each([
    [4, 'issues', 'Short'],
    [5, 'issues', 'Medium'],
    [13, 'issues', 'Long'],
    [100, 'minutes', 'Short'],
    [118, 'minutes', 'Medium'],
    [141, 'minutes', 'Long'],
  ])(
    'puts %s %s in the %s band, as the strategy does',
    (value, unit, label) => {
      expect(sizeLabel(value, unit)).toBe(label)
    },
  )

  it('reads a card size before hours, in the unit it names', () => {
    render(<SizePill size={{ unit: 'issues', value: 7 }} hours={40} />)
    expect(screen.getByText('Medium')).toHaveClass('size-pill')
    expect(screen.getByText('7 issues left')).toBeInTheDocument()
  })

  it('says one issue, and a film in minutes', () => {
    render(
      <>
        <SizePill size={{ unit: 'issues', value: 1 }} />
        <SizePill size={{ unit: 'minutes', value: 118 }} />
      </>,
    )
    expect(screen.getByText('1 issue left')).toBeInTheDocument()
    expect(screen.getByText('118 min')).toBeInTheDocument()
  })
})
