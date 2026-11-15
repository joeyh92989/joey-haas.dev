import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PostMeta from './PostMeta.jsx'

describe('PostMeta', () => {
  it('shows the reading time', () => {
    render(<PostMeta date="2026-11-06" readingMinutes={4} tags={[]} />)
    expect(screen.getByText('4 min read')).toBeInTheDocument()
  })

  it('shows an updated date that differs from the date', () => {
    render(
      <PostMeta
        date="2026-11-06"
        updated="2026-11-10"
        readingMinutes={1}
        tags={[]}
      />,
    )
    expect(screen.getByText('November 10, 2026')).toHaveAttribute(
      'datetime',
      '2026-11-10',
    )
    expect(screen.getByText(/Updated/)).toBeInTheDocument()
  })

  it('hides the updated date when it equals the date or is absent', () => {
    const { rerender } = render(
      <PostMeta date="2026-11-06" updated="2026-11-06" tags={[]} />,
    )
    expect(screen.queryByText(/Updated/)).toBeNull()
    rerender(<PostMeta date="2026-11-06" tags={[]} />)
    expect(screen.queryByText(/Updated/)).toBeNull()
    expect(screen.queryByText(/min read/)).toBeNull()
  })
})
