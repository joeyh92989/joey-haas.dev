import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import PosterGrid from './PosterGrid.jsx'

const ITEMS = [
  { id: '1', title: 'Hades' },
  { id: '2', title: 'Celeste' },
]

describe('PosterGrid', () => {
  it('renders renderCard for every item, one list item each', () => {
    render(
      <PosterGrid
        items={ITEMS}
        size="comfortable"
        renderCard={(item) => <span>card {item.title}</span>}
      />,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('card Hades')).toBeInTheDocument()
    expect(screen.getByText('card Celeste')).toBeInTheDocument()
  })

  it('sets data-size for the stylesheet', () => {
    render(<PosterGrid items={ITEMS} size="compact" renderCard={() => null} />)
    expect(screen.getByRole('list')).toHaveAttribute('data-size', 'compact')
  })
})

describe('PosterGrid paged', () => {
  // No ResizeObserver here, so a page is seven columns of four rows (28).
  const MANY = Array.from({ length: 70 }, (_, index) => ({
    id: String(index),
    title: `T${index}`,
  }))
  const grid = (props = {}) => (
    <PosterGrid
      items={MANY}
      size="comfortable"
      renderCard={(item) => <span>{item.title}</span>}
      paged
      {...props}
    />
  )

  it('shows whole rows, then more on request', async () => {
    render(grid())
    expect(document.querySelectorAll('.poster-grid li')).toHaveLength(28)
    expect(screen.getByText('Showing 28 of 70')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show 28 more' }))
    expect(document.querySelectorAll('.poster-grid li')).toHaveLength(56)
    await userEvent.click(screen.getByRole('button', { name: 'Show 14 more' }))
    expect(document.querySelectorAll('.poster-grid li')).toHaveLength(70)
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument()
  })

  it('shows everything on Show all', async () => {
    render(grid())
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect(document.querySelectorAll('.poster-grid li')).toHaveLength(70)
  })

  it('returns to the first page when resetKey changes', async () => {
    const { rerender } = render(grid({ resetKey: 'a' }))
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }))
    rerender(grid({ resetKey: 'b' }))
    expect(document.querySelectorAll('.poster-grid li')).toHaveLength(28)
  })

  it('pages nothing without the prop', () => {
    render(grid({ paged: false }))
    expect(document.querySelectorAll('.poster-grid li')).toHaveLength(70)
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument()
  })
})
