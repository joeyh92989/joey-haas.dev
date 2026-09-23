import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
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
