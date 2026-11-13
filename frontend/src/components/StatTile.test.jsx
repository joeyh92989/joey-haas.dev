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
})
