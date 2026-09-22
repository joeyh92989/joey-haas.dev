import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
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
          options: [{ value: 'game', label: 'Games', count: 2 }],
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
})
