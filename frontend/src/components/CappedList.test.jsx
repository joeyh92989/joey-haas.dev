import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CappedList from './CappedList.jsx'
import { useMediaQuery } from '../lib/useMediaQuery.js'

vi.mock('../lib/useMediaQuery.js', () => ({ useMediaQuery: vi.fn() }))

const items = (count) => Array.from({ length: count }, (_, i) => `Row ${i + 1}`)

function renderList(count, props = {}) {
  return render(
    <CappedList items={items(count)} {...props}>
      {(item) => <li key={item}>{item}</li>}
    </CappedList>,
  )
}

beforeEach(() => vi.mocked(useMediaQuery).mockReturnValue(false))

describe('CappedList', () => {
  it('shows six rows at desktop widths and offers Show all N', () => {
    renderList(12)
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByRole('button', { name: 'Show all 12' })).toBeVisible()
  })

  it('shows four rows on a phone', () => {
    vi.mocked(useMediaQuery).mockReturnValue(true)
    renderList(12)
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })

  it('has no button when everything fits', () => {
    renderList(6)
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('opens and closes, keeping focus on the one button', async () => {
    const user = userEvent.setup()
    renderList(9)
    const button = screen.getByRole('button', { name: 'Show all 9' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await user.click(button)
    expect(screen.getAllByRole('listitem')).toHaveLength(9)
    expect(button).toHaveTextContent('Show fewer')
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveFocus()
    await user.click(button)
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    expect(button).toHaveTextContent('Show all 9')
    expect(button).toHaveFocus()
  })

  it('does not render the rows past the cap, so tab never lands on one', () => {
    renderList(9)
    expect(screen.queryByText('Row 7')).toBeNull()
  })

  it('names its button for the section when given a label', () => {
    renderList(9, { label: 'Coming soon' })
    expect(
      screen.getByRole('button', { name: 'Show all 9 Coming soon' }),
    ).toBeVisible()
  })

  it('closes again when its resetKey changes, and stays open when it does not', async () => {
    const user = userEvent.setup()
    const list = (key) => (
      <CappedList items={items(9)} resetKey={key}>
        {(item) => <li key={item}>{item}</li>}
      </CappedList>
    )
    const { rerender } = render(list('a'))
    await user.click(screen.getByRole('button', { name: 'Show all 9' }))
    rerender(list('a'))
    expect(screen.getAllByRole('listitem')).toHaveLength(9)
    rerender(list('b'))
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
  })
})
