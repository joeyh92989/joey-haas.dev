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
  return renderWith({ select: true, ...props })
}

function renderWith(props = {}) {
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

describe('SortControl with select', () => {
  it('is a labelled select of the six sorts with the current one chosen', () => {
    renderSort()
    const select = screen.getByRole('combobox', { name: 'Sort' })
    expect(select).toHaveValue('added')
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual([
      'Recently added',
      'Recently finished',
      'Rating',
      'Release year',
      'Title',
      'Random',
    ])
  })

  it('is the same select on a phone', () => {
    vi.mocked(useMediaQuery).mockReturnValue(true)
    renderSort()
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument()
  })

  // Each key starts in the direction that reads naturally for it.
  it('changes key with that key’s natural direction', async () => {
    const { onChange } = renderSort()
    await userEvent.selectOptions(screen.getByRole('combobox'), 'title')
    expect(onChange).toHaveBeenCalledWith({ value: 'title', direction: 'asc' })
  })

  it('words the direction and flips it', async () => {
    const { onChange } = renderSort()
    await userEvent.click(
      screen.getByRole('button', { name: 'Order: Newest first' }),
    )
    expect(onChange).toHaveBeenCalledWith({ value: 'added', direction: 'asc' })
  })

  it.each([
    ['rating', 'desc', 'Highest first'],
    ['rating', 'asc', 'Lowest first'],
    ['title', 'asc', 'A to Z'],
    ['title', 'desc', 'Z to A'],
    ['added', 'asc', 'Oldest first'],
  ])('words %s %s as %s', (value, direction, words) => {
    renderSort({ value, direction })
    expect(
      screen.getByRole('button', { name: `Order: ${words}` }),
    ).toBeInTheDocument()
  })

  it('hides the direction and shows Shuffle for Random', async () => {
    const { onShuffle } = renderSort({ value: 'random' })
    expect(screen.getAllByRole('button')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Shuffle' }))
    expect(onShuffle).toHaveBeenCalledOnce()
  })

  it('shows no Shuffle for other sorts', () => {
    renderSort()
    expect(
      screen.queryByRole('button', { name: 'Shuffle' }),
    ).not.toBeInTheDocument()
  })

  // What's next's and Comics' sorts have one fixed order each.
  it('offers custom sorts without a direction when not directional', async () => {
    const { onChange } = renderSort({
      value: 'best',
      sorts: [
        { value: 'best', label: 'Best match', direction: 'desc' },
        { value: 'newest', label: 'Newest', direction: 'desc' },
      ],
      directional: false,
    })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveValue('best')
    await userEvent.selectOptions(screen.getByRole('combobox'), 'newest')
    expect(onChange).toHaveBeenCalledWith({
      value: 'newest',
      direction: 'desc',
    })
  })
})

describe('SortControl labels', () => {
  it('takes a label for its select', () => {
    renderSort({ label: 'Sort Buy now' })
    expect(
      screen.getByRole('combobox', { name: 'Sort Buy now' }),
    ).toBeInTheDocument()
  })

  it('can keep the name and drop the visible text', () => {
    renderSort({ hideLabel: true })
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument()
    expect(screen.getByText('Sort')).toHaveClass('visually-hidden')
  })
})

describe('SortControl by default', () => {
  it('offers the six sorts as chips with the current one pressed', () => {
    renderWith()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Sort' })).toBeInTheDocument()
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

  it('changes key with that key’s natural direction', async () => {
    const { onChange } = renderWith()
    await userEvent.click(screen.getByRole('button', { name: 'Title' }))
    expect(onChange).toHaveBeenCalledWith({ value: 'title', direction: 'asc' })
  })

  it('flips the direction with the arrow button', async () => {
    const { onChange } = renderWith()
    await userEvent.click(
      screen.getByRole('button', { name: /direction: descending/i }),
    )
    expect(onChange).toHaveBeenCalledWith({ value: 'added', direction: 'asc' })
  })

  it('offers custom sorts as chips without a direction', () => {
    renderWith({
      value: 'best',
      sorts: [
        { value: 'best', label: 'Best match', direction: 'desc' },
        { value: 'newest', label: 'Newest', direction: 'desc' },
      ],
      directional: false,
    })
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Best match' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('takes a label for its group', () => {
    renderWith({ label: 'Sort Buy now' })
    expect(
      screen.getByRole('group', { name: 'Sort Buy now' }),
    ).toBeInTheDocument()
  })

  it('is a select on a phone, and Random still has Shuffle', async () => {
    vi.mocked(useMediaQuery).mockReturnValue(true)
    const { onChange, onShuffle } = renderWith({ value: 'random' })
    const select = screen.getByRole('combobox', { name: 'Sort' })
    expect(select).toHaveValue('random')
    await userEvent.click(screen.getByRole('button', { name: 'Shuffle' }))
    expect(onShuffle).toHaveBeenCalledOnce()
    await userEvent.selectOptions(select, 'rating')
    expect(onChange).toHaveBeenCalledWith({
      value: 'rating',
      direction: 'desc',
    })
  })
})
