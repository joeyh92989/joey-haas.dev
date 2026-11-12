import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import KindTile from './KindTile.jsx'

const kind = (extra = {}) => ({
  key: 'movie',
  area: 'shelf',
  label: 'Movie',
  ways_in: ['photo', 'search', 'type'],
  has_details: true,
  fields: [],
  source_state: 'ready',
  ...extra,
})

describe('KindTile', () => {
  it('lists the ways in the kind declared and starts a sitting', async () => {
    const onStart = vi.fn()
    render(<KindTile kind={kind()} onStart={onStart} />)
    const tile = screen.getByRole('button', { name: /Movie/ })
    expect(tile).toHaveTextContent('photo · search · type')
    await userEvent.click(tile)
    expect(onStart).toHaveBeenCalledWith(kind())
  })

  it("says why a kind's source is off, in text", () => {
    render(
      <KindTile
        kind={kind({ source_state: 'movie source is not configured' })}
        onStart={() => {}}
      />,
    )
    expect(
      screen.getByText('movie source is not configured'),
    ).toBeInTheDocument()
  })

  it('is a disabled button with its reason when it takes no photos', () => {
    render(
      <KindTile
        kind={kind({
          key: 'boardgame',
          label: 'Board game',
          ways_in: ['type'],
        })}
        onStart={() => {}}
      />,
    )
    const tile = screen.getByRole('button', { name: /Board game/ })
    expect(tile).toBeDisabled()
    expect(tile).toHaveTextContent('added one at a time')
  })

  it('shows the short source reason on a disabled tile', () => {
    render(
      <KindTile
        kind={kind({
          key: 'boardgame',
          label: 'Board game',
          ways_in: ['type'],
          source_state: 'Needs a BoardGameGeek key; added by typing for now.',
        })}
        onStart={() => {}}
      />,
    )
    expect(
      screen.getAllByText('Needs a BoardGameGeek key; added by typing for now.')
        .length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText(/BGG unavailable/)).toBeNull()
  })
})
