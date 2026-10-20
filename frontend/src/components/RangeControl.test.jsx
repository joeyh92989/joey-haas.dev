import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RangeControl from './RangeControl.jsx'

describe('RangeControl', () => {
  it('offers the four ranges with the current one pressed', () => {
    render(<RangeControl value="30d" onChange={() => {}} />)
    const group = screen.getByRole('group', { name: 'Range' })
    const buttons = Array.from(group.querySelectorAll('button'))
    expect(buttons.map((button) => button.textContent)).toEqual([
      '7d',
      '30d',
      '90d',
      'All',
    ])
    expect(screen.getByRole('button', { name: '30d' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('reports a new range and ignores the current one', () => {
    const onChange = vi.fn()
    render(<RangeControl value="30d" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '30d' }))
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(onChange.mock.calls).toEqual([['all']])
  })
})
