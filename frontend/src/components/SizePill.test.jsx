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
})
