import '@testing-library/jest-dom'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CoverImage from './CoverImage.jsx'

describe('CoverImage', () => {
  it('loads lazily unless it is the page’s main image', () => {
    const { container, rerender } = render(
      <CoverImage src="https://example.test/a.jpg" type="game" />,
    )
    expect(container.querySelector('img')).toHaveAttribute('loading', 'lazy')
    rerender(
      <CoverImage src="https://example.test/a.jpg" type="game" priority />,
    )
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('loading', 'eager')
    expect(img).toHaveAttribute('fetchpriority', 'high')
  })

  it('falls back to a placeholder when the image fails', () => {
    const { container } = render(
      <CoverImage src="https://example.test/dead.jpg" type="game" />,
    )
    fireEvent.error(container.querySelector('img'))
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.cover-placeholder')).not.toBeNull()
  })

  it('tries a new src after an earlier one failed', () => {
    const { container, rerender } = render(
      <CoverImage src="https://example.test/dead.jpg" type="game" />,
    )
    fireEvent.error(container.querySelector('img'))
    rerender(<CoverImage src="https://example.test/live.jpg" type="game" />)
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://example.test/live.jpg',
    )
  })

  it('labels a missing cover with the issue number when given one', () => {
    const { container } = render(
      <CoverImage src={null} type="comic" number={3} />,
    )
    expect(container.querySelector('.cover')).toHaveAttribute('data-nocover')
    expect(container.querySelector('.cover-nocover')).toHaveTextContent(
      '#3No cover',
    )
  })

  it('leaves a missing cover without a number as an empty placeholder', () => {
    const { container } = render(<CoverImage src={null} type="game" />)
    expect(container.querySelector('.cover-nocover')).toBeNull()
    expect(container.querySelector('.cover-placeholder')).not.toBeNull()
  })
})
