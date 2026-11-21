import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { denver } from '../content/denver.js'
import SpotCard from './SpotCard.jsx'
import { CARD_SHELL } from './ui/card-classes.js'

const SPOT = {
  name: 'Union Station',
  neighbourhood: 'LoDo',
  tags: ['kid-ok', 'rainy-day'],
  blurb: 'Great hall, trains to watch.',
}

describe('SpotCard', () => {
  it('shows the name, neighbourhood, tag labels and blurb', () => {
    render(<SpotCard spot={SPOT} />)
    const card = screen.getByRole('article')
    expect(screen.getByRole('heading')).toHaveTextContent('Union Station')
    expect(card).toHaveTextContent('LoDo')
    expect(screen.getByText('Kid-OK')).toBeInTheDocument()
    expect(screen.getByText('Rainy day')).toBeInTheDocument()
    expect(card).toHaveTextContent('Great hall, trains to watch.')
    expect(card).not.toHaveClass('selected')
    expect(screen.queryByText(denver.page.offMap)).toBeNull()
  })

  it('leaves out what a spot does not have', () => {
    render(
      <SpotCard
        spot={{ ...SPOT, neighbourhood: null, tags: [], blurb: null }}
      />,
    )
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.getByRole('article').querySelectorAll('p')).toHaveLength(0)
  })

  it('is selected through its name, and marks off-map spots', () => {
    const onSelect = vi.fn()
    render(<SpotCard spot={SPOT} selected offMap onSelect={onSelect} />)
    const name = screen.getByRole('button', { name: 'Union Station' })
    expect(name).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('article')).toHaveClass('selected')
    expect(screen.getByText(denver.page.offMap)).toBeInTheDocument()
    fireEvent.click(name)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('is a card: the card shell and its tags as badges', () => {
    render(<SpotCard spot={SPOT} />)
    const card = screen.getByRole('article')
    for (const token of CARD_SHELL.split(' ').filter((c) => !c.includes('/'))) {
      expect(card.className).toContain(token)
    }
    expect(card.querySelectorAll('[data-slot="badge"]')).toHaveLength(2)
  })

  it('marks the selected card with a heavier edge as well as the class', () => {
    render(<SpotCard spot={SPOT} selected onSelect={() => {}} />)
    expect(screen.getByRole('article').className).toMatch(/\bborder-l-\[3px\]/)
  })
})
