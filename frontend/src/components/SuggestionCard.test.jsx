import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SuggestionCard from './SuggestionCard.jsx'

function suggestion(fields = {}) {
  return {
    slot_key: 'best',
    slot: 'Best bet',
    day: '2026-11-14',
    when: 'Saturday morning',
    spot_id: 'corvus',
    name: 'Corvus Coffee',
    tags: ['coffee', 'bike-friendly'],
    distance: '1.2 mi',
    reasons: ['Dry until noon', 'Not been in a month'],
    saved: false,
    ...fields,
  }
}

function handlers() {
  return {
    onSave: vi.fn(),
    onUnsave: vi.fn(),
    onBeen: vi.fn(),
    onSkip: vi.fn(),
  }
}

describe('SuggestionCard', () => {
  it('shows the slot, spot, tags, distance and reasons', () => {
    render(<SuggestionCard suggestion={suggestion()} lead {...handlers()} />)
    const card = screen.getByRole('listitem', { name: 'Corvus Coffee' })
    expect(card).toHaveClass('sug', 'lead')
    expect(screen.getByText('Best bet')).toBeInTheDocument()
    expect(screen.getByText('Saturday morning')).toBeInTheDocument()
    expect(screen.getByText('Coffee')).toBeInTheDocument()
    expect(screen.getByText('Bike-friendly')).toBeInTheDocument()
    expect(screen.getByText('1.2 mi')).toBeInTheDocument()
    expect(screen.getByText('Not been in a month')).toBeInTheDocument()
  })

  it('offers Save, Been and Skip, each naming the spot', async () => {
    const user = userEvent.setup()
    const on = handlers()
    const s = suggestion()
    render(<SuggestionCard suggestion={s} {...on} />)
    await user.click(
      screen.getByRole('button', { name: 'Save: Corvus Coffee' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Been: Corvus Coffee' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Skip: Corvus Coffee' }),
    )
    expect(on.onSave).toHaveBeenCalledWith(s)
    expect(on.onBeen).toHaveBeenCalledWith(s)
    expect(on.onSkip).toHaveBeenCalledWith(s)
    expect(on.onUnsave).not.toHaveBeenCalled()
  })

  it('a saved card says what for and offers Unsave instead of Save and Skip', async () => {
    const user = userEvent.setup()
    const on = handlers()
    render(<SuggestionCard suggestion={suggestion({ saved: true })} {...on} />)
    expect(screen.getByRole('listitem', { name: 'Corvus Coffee' })).toHaveClass(
      'saved',
    )
    expect(screen.getByText('Saved for Saturday morning')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Skip/ })).toBeNull()
    await user.click(
      screen.getByRole('button', { name: 'Unsave: Corvus Coffee' }),
    )
    expect(on.onUnsave).toHaveBeenCalled()
  })

  it('says Visited instead of Been once logged, and waits while busy', () => {
    render(
      <SuggestionCard suggestion={suggestion()} visited busy {...handlers()} />,
    )
    expect(screen.getByText('Visited')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Been/ })).toBeNull()
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled()
    }
  })
})
