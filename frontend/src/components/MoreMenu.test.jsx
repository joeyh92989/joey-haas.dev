import '@testing-library/jest-dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { moreItems } from '../lib/navMore.js'
import MoreMenu from './MoreMenu.jsx'

function renderAt(path = '/', flags = { hasNotes: true }) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <button type="button">Elsewhere</button>
      <MoreMenu items={moreItems(flags)} />
    </MemoryRouter>,
  )
}

const button = () => screen.getByRole('button', { name: 'More' })
const open = () => fireEvent.click(button())
const panel = () =>
  document.getElementById(button().getAttribute('aria-controls'))

describe('MoreMenu', () => {
  it('is closed at first and opens and closes from its button', () => {
    renderAt()
    expect(button()).toHaveAttribute('aria-expanded', 'false')
    expect(panel()).toHaveAttribute('hidden')
    fireEvent.click(button())
    expect(button()).toHaveAttribute('aria-expanded', 'true')
    expect(panel()).not.toHaveAttribute('hidden')
    expect(
      within(panel())
        .getAllByRole('link')
        .map((link) => link.querySelector('.t').textContent),
    ).toEqual(['Now', 'Stats', 'TIL', 'Daily game', 'Colophon'])
    fireEvent.click(button())
    expect(panel()).toHaveAttribute('hidden')
  })

  it('closes on Escape and returns focus to the button', () => {
    renderAt()
    fireEvent.click(button())
    within(panel()).getByRole('link', { name: /Stats/ }).focus()
    fireEvent.keyDown(document.activeElement, { key: 'Escape' })
    expect(button()).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(button())
  })

  it('closes on a click outside, not inside', () => {
    renderAt()
    fireEvent.click(button())
    fireEvent.pointerDown(panel())
    expect(button()).toHaveAttribute('aria-expanded', 'true')
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(button()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes when focus leaves it and when a link is followed', () => {
    renderAt()
    fireEvent.click(button())
    fireEvent.blur(button(), {
      relatedTarget: screen.getByRole('button', { name: 'Elsewhere' }),
    })
    expect(button()).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button())
    fireEvent.click(within(panel()).getByRole('link', { name: /Stats/ }))
    expect(button()).toHaveAttribute('aria-expanded', 'false')
  })

  it('underlines More and marks the row on one of its pages', () => {
    renderAt('/stats')
    open()
    expect(button()).toHaveClass('active')
    expect(
      within(panel()).getByRole('link', { name: /Stats/ }),
    ).toHaveAttribute('aria-current', 'page')
    expect(
      within(panel()).getByRole('link', { name: /Now/ }),
    ).not.toHaveAttribute('aria-current')
  })

  it('leaves More plain elsewhere', () => {
    renderAt('/about')
    expect(button()).not.toHaveClass('active')
  })

  it('marks the Daily game row on /daily but does not underline More', () => {
    renderAt('/daily')
    open()
    expect(button()).not.toHaveClass('active')
    expect(
      within(panel()).getByRole('link', { name: /Daily game/ }),
    ).toHaveAttribute('aria-current', 'page')
  })

  it('hides TIL while it is absent', () => {
    renderAt('/', { hasNotes: false })
    const names = within(panel())
      .getAllByRole('link', { hidden: true })
      .map((link) => link.querySelector('.t').textContent)
    expect(names).toEqual(['Now', 'Stats', 'Daily game', 'Colophon'])
  })
})
