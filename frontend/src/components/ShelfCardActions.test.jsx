import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMediaQuery } from '../lib/useMediaQuery.js'
import ShelfCardActions from './ShelfCardActions.jsx'

vi.mock('../lib/useMediaQuery.js', () => ({ useMediaQuery: vi.fn() }))

const ITEM = {
  id: 'a',
  title: 'Star Fox',
  status: 'backlog',
  rating: 4,
  favorite: false,
  is_public: false,
}

/** Stubs the pointer query; every other query is false. */
function pointer(hover) {
  vi.mocked(useMediaQuery).mockImplementation(
    (query) => hover && query === '(hover: hover)',
  )
}

function renderActions(item = ITEM) {
  const handlers = {
    onRate: vi.fn(),
    onFavorite: vi.fn(),
    onStatus: vi.fn(),
    onPublish: vi.fn(),
  }
  render(
    <div>
      <ShelfCardActions item={item} {...handlers} />
      <p>outside</p>
    </div>,
  )
  return handlers
}

afterEach(() => {
  vi.mocked(useMediaQuery).mockReset()
})

describe('ShelfCardActions on a pointer device', () => {
  it('renders the panel in place, with no menu button', () => {
    pointer(true)
    renderActions()
    expect(
      screen.getByRole('radiogroup', { name: 'Rating' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /actions for/i })).toBeNull()
    expect(document.querySelector('.shelf-actions')).toHaveAttribute(
      'data-mode',
      'hover',
    )
  })

  it('passes the item and the new value to each callback', async () => {
    pointer(true)
    const handlers = renderActions()

    await userEvent.click(
      screen.getByRole('radio', { name: 'Rate 8 out of 10' }),
    )
    expect(handlers.onRate).toHaveBeenCalledWith(ITEM, 8)

    await userEvent.click(screen.getByRole('radio', { name: 'Clear rating' }))
    expect(handlers.onRate).toHaveBeenLastCalledWith(ITEM, null)

    await userEvent.click(screen.getByRole('button', { name: 'Favourite' }))
    expect(handlers.onFavorite).toHaveBeenCalledWith(ITEM, true)

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Status for Star Fox' }),
      'finished',
    )
    expect(handlers.onStatus).toHaveBeenCalledWith(ITEM, 'finished')

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Public: Star Fox' }),
    )
    expect(handlers.onPublish).toHaveBeenCalledWith(ITEM, true)
  })

  it('shows the favourite as pressed, and unfavourites', async () => {
    pointer(true)
    const handlers = renderActions({ ...ITEM, favorite: true })
    const heart = screen.getByRole('button', { name: 'Favourite' })
    expect(heart).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(heart)
    expect(handlers.onFavorite).toHaveBeenCalledWith(
      { ...ITEM, favorite: true },
      false,
    )
  })
})

describe('ShelfCardActions when four favourites are set', () => {
  function renderFull(item = ITEM) {
    const handlers = {
      onRate: vi.fn(),
      onFavorite: vi.fn(),
      onStatus: vi.fn(),
      onPublish: vi.fn(),
    }
    render(<ShelfCardActions item={item} favoritesFull {...handlers} />)
    return handlers
  }

  // aria-disabled rather than disabled: the heart stays focusable, so a
  // keyboard user can reach it and hear why it is unavailable.
  it('marks the empty heart unavailable, and says why', () => {
    pointer(true)
    renderFull()
    const heart = screen.getByRole('button', { name: 'Favourite' })
    expect(heart).toHaveAttribute('aria-disabled', 'true')
    expect(heart).not.toBeDisabled()
    expect(heart).toHaveAccessibleDescription(
      'Four favourites already set. Unfavourite one first.',
    )
  })

  // The page decides what a blocked click does; the card only reports it.
  it('still reports a click on the unavailable heart', async () => {
    pointer(true)
    const handlers = renderFull()
    await userEvent.click(screen.getByRole('button', { name: 'Favourite' }))
    expect(handlers.onFavorite).toHaveBeenCalledWith(ITEM, true)
  })

  it('leaves a favourite’s own heart available, so it can be unfavourited', () => {
    pointer(true)
    renderFull({ ...ITEM, favorite: true })
    const heart = screen.getByRole('button', { name: 'Favourite' })
    expect(heart).not.toHaveAttribute('aria-disabled')
    expect(heart).not.toHaveAccessibleDescription()
  })

  it('is unaffected while there is room', () => {
    pointer(true)
    renderActions()
    expect(
      screen.getByRole('button', { name: 'Favourite' }),
    ).not.toHaveAttribute('aria-disabled')
  })
})

describe('ShelfCardActions on a touch device', () => {
  it('collapses to one button that opens the panel as a sheet', async () => {
    pointer(false)
    renderActions()

    const button = screen.getByRole('button', { name: 'Actions for Star Fox' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('radiogroup')).toBeNull()

    await userEvent.click(button)

    expect(button).toHaveAttribute('aria-expanded', 'true')
    const sheet = screen.getByRole('dialog', { name: 'Actions for Star Fox' })
    expect(sheet).toContainElement(screen.getByRole('radiogroup'))
  })

  it('closes on Escape and returns focus to the button', async () => {
    pointer(false)
    renderActions()
    const button = screen.getByRole('button', { name: 'Actions for Star Fox' })
    await userEvent.click(button)

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(button).toHaveFocus()
  })

  it('closes on a click outside, and stays open on a click inside', async () => {
    pointer(false)
    const handlers = renderActions()
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for Star Fox' }),
    )

    await userEvent.click(
      screen.getByRole('radio', { name: 'Rate 6 out of 10' }),
    )
    expect(handlers.onRate).toHaveBeenCalledWith(ITEM, 6)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await userEvent.click(screen.getByText('outside'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
