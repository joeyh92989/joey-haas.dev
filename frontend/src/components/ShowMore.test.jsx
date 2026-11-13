import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ShowMore from './ShowMore.jsx'

describe('ShowMore', () => {
  it('counts what is shown and offers a page or all', async () => {
    const onMore = vi.fn()
    const onAll = vi.fn()
    render(
      <ShowMore
        shown={28}
        total={119}
        step={28}
        onMore={onMore}
        onAll={onAll}
      />,
    )
    expect(screen.getByText('Showing 28 of 119')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show 28 more' }))
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect(onMore).toHaveBeenCalledOnce()
    expect(onAll).toHaveBeenCalledOnce()
  })

  it('offers only what is left on the last page', () => {
    render(
      <ShowMore
        shown={112}
        total={119}
        step={28}
        onMore={vi.fn()}
        onAll={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Show 7 more' }),
    ).toBeInTheDocument()
  })

  it('renders nothing once everything is shown', () => {
    const { container } = render(
      <ShowMore
        shown={10}
        total={10}
        step={28}
        onMore={vi.fn()}
        onAll={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
