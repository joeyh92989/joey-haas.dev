import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMediaQuery } from '../lib/useMediaQuery.js'
import SortControl from './SortControl.jsx'

vi.mock('../lib/useMediaQuery.js', () => ({
  useMediaQuery: vi.fn(() => false),
}))

afterEach(() => {
  vi.mocked(useMediaQuery).mockReturnValue(false)
})

function renderSort(props = {}) {
  const onChange = vi.fn()
  const onShuffle = vi.fn()
  render(
    <SortControl
      value="added"
      direction="desc"
      seed={1}
      onChange={onChange}
      onShuffle={onShuffle}
      {...props}
    />,
  )
  return { onChange, onShuffle }
}

describe('SortControl as buttons', () => {
  it('offers the six sorts with the current one pressed', () => {
    renderSort()
    for (const name of [
      'Recently added',
      'Recently finished',
      'Rating',
      'Release year',
      'Title',
      'Random',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(
      screen.getByRole('button', { name: 'Recently added' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  // Each key starts in the direction that reads naturally for it.
  it('changes key with that key’s natural direction', async () => {
    const { onChange } = renderSort()
    await userEvent.click(screen.getByRole('button', { name: 'Title' }))
    expect(onChange).toHaveBeenCalledWith({ value: 'title', direction: 'asc' })
  })

  it('flips the direction', async () => {
    const { onChange } = renderSort()
    await userEvent.click(
      screen.getByRole('button', { name: /direction: descending/i }),
    )
    expect(onChange).toHaveBeenCalledWith({ value: 'added', direction: 'asc' })
  })

  it('hides the direction and shows Shuffle for Random', async () => {
    const { onShuffle } = renderSort({ value: 'random' })
    expect(
      screen.queryByRole('button', { name: /direction/i }),
    ).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Shuffle' }))
    expect(onShuffle).toHaveBeenCalledOnce()
  })

  it('shows no Shuffle for other sorts', () => {
    renderSort()
    expect(
      screen.queryByRole('button', { name: 'Shuffle' }),
    ).not.toBeInTheDocument()
  })
})

describe('SortControl on a narrow screen', () => {
  it('is a select, and Random still has Shuffle', async () => {
    vi.mocked(useMediaQuery).mockReturnValue(true)
    const { onChange, onShuffle } = renderSort({ value: 'random' })

    const select = screen.getByRole('combobox', { name: 'Sort' })
    expect(select).toHaveValue('random')
    expect(
      screen.queryByRole('button', { name: 'Recently added' }),
    ).not.toBeInTheDocument()

    // A select fires nothing on re-choosing the current option, hence the
    // explicit button.
    await userEvent.click(screen.getByRole('button', { name: 'Shuffle' }))
    expect(onShuffle).toHaveBeenCalledOnce()

    await userEvent.selectOptions(select, 'rating')
    expect(onChange).toHaveBeenCalledWith({
      value: 'rating',
      direction: 'desc',
    })
  })
})
