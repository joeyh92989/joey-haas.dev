import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StatTile, { StatTiles } from './StatTile.jsx'

describe('StatTile', () => {
  it('pairs each label with its figure and detail', () => {
    render(
      <StatTiles label="Shelf">
        <StatTile label="Owned" value={107} detail="70 public · 37 hidden" />
        <StatTile label="Finished" value={13} />
      </StatTiles>,
    )
    const terms = screen.getAllByRole('term').map((term) => term.textContent)
    const values = screen
      .getAllByRole('definition')
      .map((value) => value.textContent)
    expect(terms).toEqual(['Owned', 'Finished'])
    expect(values).toEqual(['107', '70 public · 37 hidden', '13'])
  })

  it('wraps the list in a named group only when given a label', () => {
    const { rerender } = render(
      <StatTiles label="Shelf">
        <StatTile label="Owned" value={1} />
      </StatTiles>,
    )
    expect(screen.getByRole('group', { name: 'Shelf' })).toBeInTheDocument()
    rerender(
      <StatTiles>
        <StatTile label="Owned" value={1} />
      </StatTiles>,
    )
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.getByRole('term')).toHaveTextContent('Owned')
  })

  it('draws a tile as a flat card, with the figure in the serif and the label in mono', () => {
    const { container } = render(
      <StatTiles>
        <StatTile label="Owned" value={107} detail="70 public" />
      </StatTiles>,
    )
    const tile = container.querySelector('.stat-tile')
    expect(tile.className).toContain('border-border')
    expect(tile.className).toContain('bg-card')
    expect(tile.className).not.toMatch(/shadow|rounded-4xl/)
    expect(container.querySelector('.stat-value').className).toContain(
      'font-heading',
    )
    expect(container.querySelector('.kicker').className).toContain('font-mono')
  })

  it('keeps the composite tile on the same card', () => {
    const { container } = render(
      <StatTiles figures>
        <StatTile label="Rating">4 of 5</StatTile>
      </StatTiles>,
    )
    const tile = container.querySelector('.stat-tile-figures')
    expect(tile).toHaveClass('stat-tile')
    expect(tile.className).toContain('bg-card')
  })
})
