import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import SpineCard from './SpineCard.jsx'

const ITEM = {
  id: '1',
  type: 'game',
  title: 'Hades',
  year: 2020,
  status: 'finished',
}

function renderSpine(props = {}) {
  return render(
    <MemoryRouter>
      <SpineCard item={ITEM} to="/shelf/1" number={7} {...props} />
    </MemoryRouter>,
  )
}

describe('SpineCard', () => {
  it('is one link to the item, named by its title first', () => {
    renderSpine()
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/shelf/1')
    expect(link.getAttribute('aria-label')).toBeNull()
    expect(link).toHaveAccessibleName(/^Hades\b/)
  })

  it('says the status as a visually hidden word inside the link', () => {
    renderSpine()
    const word = screen.getByText('Finished')
    expect(word).toHaveClass('sr-only')
    expect(word.closest('a')).not.toBeNull()
    expect(screen.getByRole('link')).toHaveAccessibleName(/Finished/)
  })

  it('uses the status names a comic passes', () => {
    renderSpine({
      item: { ...ITEM, status: 'active' },
      statusLabels: { active: 'Reading' },
    })
    expect(screen.getByText('Reading')).toHaveClass('sr-only')
  })

  it('hides the number from assistive tech and pads it to three digits', () => {
    renderSpine()
    const no = screen.getByText('007')
    expect(no).toHaveAttribute('aria-hidden', 'true')
  })

  it('fills the mark for finished and playing, and leaves the rest outlined', () => {
    const filled = (status) => {
      const { container, unmount } = renderSpine({
        item: { ...ITEM, status },
      })
      const value = container
        .querySelector('[data-slot="status-mark-square"]')
        .getAttribute('data-filled')
      unmount()
      return value
    }
    expect(filled('finished')).toBe('true')
    expect(filled('active')).toBe('true')
    expect(filled('backlog')).toBe('false')
    expect(filled('paused')).toBe('false')
  })

  it('shows the year when there is one, and no placeholder when there is not', () => {
    const { unmount } = renderSpine()
    expect(screen.getByText('2020')).toBeInTheDocument()
    unmount()
    renderSpine({ item: { ...ITEM, year: null } })
    expect(screen.queryByText('2020')).toBeNull()
  })

  it('wraps a long title in the full width and never clamps it', () => {
    const title = 'The Extraordinarily Long Title of a Very Patient Game'
    renderSpine({ item: { ...ITEM, title } })
    const text = screen.getByText(title)
    expect(text.className).toContain('[overflow-wrap:anywhere]')
    expect(text.className).not.toContain('overflow-hidden')
    expect(text.className).not.toContain('line-clamp')
  })

  it('draws the keyboard ring on the link, and lifts only for motion-safe', () => {
    renderSpine()
    const link = screen.getByRole('link')
    expect(link.className).toContain('focus-visible:outline-2')
    expect(link.className).toContain('motion-safe:hover:-translate-y-1.5')
  })
})
