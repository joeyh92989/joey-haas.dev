import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Rating from './Rating.jsx'

describe('Rating', () => {
  it('writes a star and the number, named out of ten', () => {
    render(<Rating rating={8} />)
    const rating = screen.getByRole('img', { name: '8 out of 10' })
    expect(rating).toHaveTextContent('★8')
    expect(rating).toHaveClass('rating')
  })

  it('writes every value the same way, odd ones too', () => {
    render(<Rating rating={7} />)
    expect(screen.getByRole('img', { name: '7 out of 10' })).toHaveTextContent(
      '★7',
    )
  })

  it('keeps a decimal average as it is', () => {
    render(<Rating rating={7.1} />)
    expect(
      screen.getByRole('img', { name: '7.1 out of 10' }),
    ).toHaveTextContent('★7.1')
  })

  it('has a larger size', () => {
    render(<Rating rating={8} size="large" />)
    expect(screen.getByRole('img')).toHaveClass('rating-large')
  })

  it('renders nothing when unrated, never a zero', () => {
    const { container, rerender } = render(<Rating rating={null} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<Rating rating={0} />)
    expect(container).toBeEmptyDOMElement()
  })
})
