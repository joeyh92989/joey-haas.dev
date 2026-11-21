import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import JumpNav from './JumpNav.jsx'

const ITEMS = [
  { id: 'next-tonight', label: 'Tonight' },
  { id: 'next-buy_now', label: 'In stores now', count: 8 },
  { id: 'next-later', label: 'Further out', count: 12 },
]

describe('JumpNav', () => {
  it('is a navigation named On this page with one link per section', () => {
    render(<JumpNav items={ITEMS} />)
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    const links = nav.querySelectorAll('a')
    expect([...links].map((a) => a.getAttribute('href'))).toEqual([
      '#next-tonight',
      '#next-buy_now',
      '#next-later',
    ])
  })

  it('shows a count beside the sections that have one', () => {
    render(<JumpNav items={ITEMS} />)
    expect(
      screen.getByRole('link', { name: /In stores now/ }),
    ).toHaveTextContent('In stores now 8')
    expect(screen.getByRole('link', { name: 'Tonight' })).toBeVisible()
  })

  it('draws nothing when there is only one place to go', () => {
    const { container } = render(<JumpNav items={ITEMS.slice(0, 1)} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('sticks under the page top and gives each link a 44px phone target and a ring', () => {
    // The rules moved from index.css to utilities (#536); the pixels are
    // measured in the style dump and the e2e specs.
    render(<JumpNav items={ITEMS} />)
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    expect(nav.className).toContain('sticky')
    for (const link of nav.querySelectorAll('a')) {
      expect(link.className).toContain('min-h-11')
      expect(link.className).toContain('focus-visible:outline-ring')
    }
  })
})
