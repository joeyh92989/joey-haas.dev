import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import QuickRate from './QuickRate.jsx'

function renderRate(value = null) {
  const onChange = vi.fn()
  render(<QuickRate value={value} onChange={onChange} />)
  return onChange
}

describe('QuickRate', () => {
  it('is a radio group of ten half-star targets', () => {
    renderRate()
    expect(
      screen.getByRole('radiogroup', { name: 'Rating' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(10)
    expect(
      screen.getByRole('radio', { name: 'Rate 1 out of 10' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('radio', { name: 'Rate 10 out of 10' }),
    ).toBeInTheDocument()
  })

  it('sets a rating on click', async () => {
    const onChange = renderRate()
    await userEvent.click(
      screen.getByRole('radio', { name: 'Rate 7 out of 10' }),
    )
    expect(onChange).toHaveBeenCalledWith(7)
  })

  // The current value's target is the way to clear it.
  it('names the current value Clear rating, checks it, and clears on click', async () => {
    const onChange = renderRate(6)
    const current = screen.getByRole('radio', { name: 'Clear rating' })
    expect(current).toHaveAttribute('aria-checked', 'true')
    expect(
      screen.queryByRole('radio', { name: 'Rate 6 out of 10' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('radio', { name: 'Rate 5 out of 10' }),
    ).toHaveAttribute('aria-checked', 'false')

    await userEvent.click(current)
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('is one tab stop: the current value, or the first target', () => {
    renderRate(4)
    const stops = screen
      .getAllByRole('radio')
      .filter((radio) => radio.getAttribute('tabindex') === '0')
    expect(stops).toHaveLength(1)
    expect(stops[0]).toHaveAccessibleName('Clear rating')
  })

  it('moves focus with the arrow keys without selecting', async () => {
    const onChange = renderRate()
    await userEvent.tab()
    expect(
      screen.getByRole('radio', { name: 'Rate 1 out of 10' }),
    ).toHaveFocus()

    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    const three = screen.getByRole('radio', { name: 'Rate 3 out of 10' })
    expect(three).toHaveFocus()
    expect(three).toHaveAttribute('tabindex', '0')

    await userEvent.keyboard('{ArrowLeft}')
    expect(
      screen.getByRole('radio', { name: 'Rate 2 out of 10' }),
    ).toHaveFocus()
    // Tabbing out leaves the group in one step.
    await userEvent.tab()
    expect(document.body).toHaveFocus()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('stops at the ends', async () => {
    renderRate()
    await userEvent.tab()
    await userEvent.keyboard('{ArrowLeft}')
    expect(
      screen.getByRole('radio', { name: 'Rate 1 out of 10' }),
    ).toHaveFocus()
    await userEvent.keyboard('{End}{ArrowRight}')
    expect(
      screen.getByRole('radio', { name: 'Rate 10 out of 10' }),
    ).toHaveFocus()
  })

  it('selects the focused target with Space or Enter', async () => {
    const onChange = renderRate()
    await userEvent.tab()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight} ')
    expect(onChange).toHaveBeenLastCalledWith(4)
    await userEvent.keyboard('{ArrowRight}{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(5)
  })
})
