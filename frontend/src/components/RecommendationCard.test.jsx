import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import RecommendationCard, { DISCOVER_ACTIONS } from './RecommendationCard.jsx'

const ROW = {
  id: 'r1',
  title: 'Inscryption',
  cover_url: null,
  platform: 'Nintendo Switch',
  physical_format: 'game_card',
  format_note: null,
  reasons: ['Like Hades, a run-based game you would finish twice.'],
  store_lines: [],
}

describe('RecommendationCard', () => {
  it("offers Radar's three answers by default, each named for its game", () => {
    render(<RecommendationCard row={ROW} when="2021" onAnswer={() => {}} />)
    const names = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
    expect(names).toEqual([
      'Want Inscryption',
      'Not interested in Inscryption',
      'Skip Inscryption',
    ])
    expect(
      screen.getByText('2021 · Nintendo Switch · Full game on cartridge'),
    ).toBeInTheDocument()
  })

  it('shows what a Discover pick is based on, its genres and Already own', async () => {
    const onAnswer = vi.fn()
    render(
      <RecommendationCard
        row={{
          ...ROW,
          based_on_titles: ['Hades', 'Dredge'],
          genres: ['Card & Board Game', 'Adventure'],
        }}
        actions={DISCOVER_ACTIONS}
        onAnswer={onAnswer}
      />,
    )
    expect(screen.getByText('Based on: Hades, Dredge')).toBeInTheDocument()
    const genres = screen.getByRole('list', { name: 'Genres' })
    expect(within(genres).getByText('Adventure')).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Already own Inscryption' }),
    )
    expect(onAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'r1' }),
      'own',
    )
  })

  it('names the pre-order window on a pre-order line only', () => {
    render(
      <RecommendationCard
        row={{
          ...ROW,
          store_lines: [
            {
              store: 'Limited Run Games',
              url: 'https://example.test/a',
              price: '39.99',
              currency: 'USD',
              availability: 'preorder',
              preorder_closes_at: '2026-11-08',
            },
            {
              store: 'Super Rare Games',
              url: 'https://example.test/b',
              price: '29.99',
              currency: 'GBP',
              availability: 'in_stock',
              preorder_closes_at: '2026-11-08',
            },
          ],
        }}
        onAnswer={() => {}}
      />,
    )
    const preorder = screen
      .getByRole('link', { name: 'Limited Run Games' })
      .closest('li')
    const inStock = screen
      .getByRole('link', { name: 'Super Rare Games' })
      .closest('li')
    expect(preorder).toHaveTextContent('pre-orders close Nov 8, 2026')
    expect(inStock).not.toHaveTextContent('pre-orders close')
  })
})
