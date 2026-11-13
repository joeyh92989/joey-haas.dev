import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ResultBar from './ResultBar.jsx'

describe('ResultBar', () => {
  it('shows the total and no Clear while nothing is filtered', () => {
    render(
      <ResultBar shown={119} total={119} filtered={false} onClear={vi.fn()} />,
    )
    expect(screen.getByText('119 titles')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Clear filters' }),
    ).not.toBeInTheDocument()
  })

  it('shows N of M and Clear filters while filtered', async () => {
    const onClear = vi.fn()
    render(<ResultBar shown={59} total={119} filtered onClear={onClear} />)
    expect(screen.getByText('59 of 119 titles')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('keeps the Clear button out of the live region', () => {
    render(<ResultBar shown={1} total={2} filtered onClear={vi.fn()} />)
    const live = document.querySelector('[aria-live]')
    expect(live).toHaveTextContent('1 of 2 titles')
    expect(live).not.toContainElement(
      screen.getByRole('button', { name: 'Clear filters' }),
    )
  })

  it('says title for a shelf of one', () => {
    render(<ResultBar shown={1} total={1} filtered={false} onClear={vi.fn()} />)
    expect(screen.getByText('1 title')).toBeInTheDocument()
  })

  it('renders its children beside the count', () => {
    render(
      <ResultBar shown={1} total={2} filtered onClear={vi.fn()}>
        <p>beside</p>
      </ResultBar>,
    )
    expect(screen.getByText('beside')).toBeInTheDocument()
  })
})
