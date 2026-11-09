import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ShelfleBoard from './ShelfleBoard.jsx'
import { grade } from '../lib/daily.js'
import { axeViolations } from '../lib/axe.test-util.js'

const ANSWER = {
  id: 'a',
  title: 'Sea of Stars',
  platform: 'Nintendo Switch',
  year: 2023,
  genres: ['Role-playing (RPG)', 'Adventure'],
  time_to_beat_hours: 12,
}
const GUESS = {
  id: 'g',
  title: 'Chained Echoes',
  platform: 'Nintendo Switch 2',
  year: 2022,
  genres: ['Adventure', 'Indie'],
  time_to_beat_hours: 40,
}

describe('ShelfleBoard', () => {
  it('is a table with column headers and six rows', async () => {
    const { container } = render(<ShelfleBoard rows={[]} />)
    const table = screen.getByRole('table', { name: '0 of 6 guesses' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Guess', 'Platform', 'Year', 'Genre', 'Size'])
    expect(within(table).getAllByRole('row')).toHaveLength(7)
    expect(within(table).getAllByText('Empty')).toHaveLength(6)
    expect(await axeViolations(container)).toEqual([])
  })

  it('writes each graded cell with its state in text', async () => {
    const rows = [
      { title: GUESS.title, grades: grade(GUESS, ANSWER) },
      { title: ANSWER.title, grades: grade(ANSWER, ANSWER) },
    ]
    const { container } = render(<ShelfleBoard rows={rows} />)
    const [, first, second] = screen.getAllByRole('row')
    const cells = within(first).getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('Chained Echoes')
    expect(cells[1]).toHaveAttribute('data-state', 'close')
    expect(cells[1]).toHaveTextContent('Switch 2, close')
    expect(cells[2]).toHaveAttribute('data-state', 'close')
    expect(cells[2]).toHaveTextContent('2022↑ later, close, later')
    expect(cells[3]).toHaveAttribute('data-state', 'close')
    expect(cells[3]).toHaveTextContent('Adventure, close')
    expect(cells[4]).toHaveAttribute('data-state', 'close')
    expect(cells[4]).toHaveTextContent('Long↓ shorter, close, shorter')
    within(second)
      .getAllByRole('cell')
      .slice(1)
      .forEach((cell) => expect(cell).toHaveAttribute('data-state', 'match'))
    expect(screen.getAllByText('Empty')).toHaveLength(4)
    expect(
      screen.getByRole('table', { name: '2 of 6 guesses' }),
    ).toBeInTheDocument()
    expect(await axeViolations(container)).toEqual([])
  })
})
