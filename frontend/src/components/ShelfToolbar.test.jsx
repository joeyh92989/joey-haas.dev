import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NO_FILTER } from '../lib/shelf.js'
import ShelfToolbar from './ShelfToolbar.jsx'

vi.mock('../lib/useMediaQuery.js', () => ({ useMediaQuery: () => false }))

function renderToolbar(props = {}) {
  const handlers = {
    onFiltersChange: vi.fn(),
    onSortChange: vi.fn(),
    onShuffle: vi.fn(),
    onSizeChange: vi.fn(),
    onDimChange: vi.fn(),
  }
  render(
    <ShelfToolbar
      groups={[
        {
          key: 'type',
          label: 'Type',
          options: [
            { value: 'game', label: 'Games', count: 2 },
            { value: 'movie', label: 'Film & TV', count: 1 },
          ],
        },
      ]}
      toggles={[{ key: 'wanted', label: 'Want', count: 1 }]}
      filters={NO_FILTER}
      sort={{ value: 'added', direction: 'desc' }}
      seed={5}
      size="comfortable"
      dim={false}
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

describe('ShelfToolbar', () => {
  it('composes the chips and the sort', async () => {
    const { onFiltersChange, onSortChange } = renderToolbar()

    await userEvent.click(screen.getByRole('button', { name: /Games/ }))
    expect(onFiltersChange).toHaveBeenCalledWith({ ...NO_FILTER, type: 'game' })

    await userEvent.click(screen.getByRole('button', { name: 'Rating' }))
    expect(onSortChange).toHaveBeenCalledWith({
      value: 'rating',
      direction: 'desc',
    })
    expect(screen.getByRole('button', { name: /Want/ })).toBeInTheDocument()
  })

  it('passes the seed through to the sort', () => {
    renderToolbar()
    expect(document.querySelector('.sort-control')).toHaveAttribute(
      'data-seed',
      '5',
    )
  })

  it('toggles the poster size', async () => {
    const { onSizeChange } = renderToolbar()
    expect(screen.getByRole('button', { name: 'Comfortable' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Compact' }))
    expect(onSizeChange).toHaveBeenCalledWith('compact')
  })

  it('toggles Dim finished', async () => {
    const { onDimChange } = renderToolbar({ dim: true })
    const dim = screen.getByRole('button', { name: 'Dim finished' })
    expect(dim).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(dim)
    expect(onDimChange).toHaveBeenCalledWith(false)
  })

  describe('layout (Cards and Spines)', () => {
    it('offers no layout toggle unless the page passes a handler', () => {
      renderToolbar({ labelled: true })
      expect(screen.queryByRole('group', { name: 'Layout' })).toBeNull()
    })

    it('shows Cards and Spines as pressed buttons and reports a change', async () => {
      const onLayoutChange = vi.fn()
      renderToolbar({ labelled: true, layout: 'cards', onLayoutChange })
      const group = screen.getByRole('group', { name: 'Layout' })
      const cards = within(group).getByRole('button', { name: 'Cards' })
      const spines = within(group).getByRole('button', { name: 'Spines' })
      expect(cards).toHaveAttribute('aria-pressed', 'true')
      expect(spines).toHaveAttribute('aria-pressed', 'false')
      await userEvent.click(spines)
      expect(onLayoutChange).toHaveBeenCalledWith('spines')
    })

    it('hides poster size and Dim finished in the spine layout, which has neither', () => {
      renderToolbar({
        labelled: true,
        layout: 'spines',
        onLayoutChange: vi.fn(),
      })
      expect(screen.queryByRole('button', { name: 'Compact' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Dim finished' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Spines' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })

    it('keeps size and dim in the card layout', () => {
      renderToolbar({
        labelled: true,
        layout: 'cards',
        onLayoutChange: vi.fn(),
      })
      expect(
        screen.getByRole('button', { name: 'Comfortable' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Dim finished' }),
      ).toBeInTheDocument()
    })
  })

  it('presses Comfortable, Dim finished and the layout with a fill, not a thin rule', () => {
    renderToolbar({ labelled: true, layout: 'cards', onLayoutChange: vi.fn() })
    for (const name of ['Comfortable', 'Dim finished', 'Cards']) {
      const button = screen.getByRole('button', { name })
      expect(button.className, name).toContain('aria-pressed:bg-foreground')
      expect(button.className, name).toContain('aria-pressed:text-background')
      expect(button.className, name).toContain('aria-pressed:font-semibold')
    }
  })
})
