import '@testing-library/jest-dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SiteMast from './SiteMast.jsx'

const ITEMS = [
  { to: '/', label: 'Home', end: true },
  { to: '/about', label: 'About' },
  { to: '/spine', label: 'Spine' },
]

function renderAt(path = '/', props = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SiteMast
        theme="dark"
        onToggleTheme={() => {}}
        items={ITEMS}
        {...props}
      />
    </MemoryRouter>,
  )
}

function menuButton() {
  return screen.getByRole('button', { name: 'Menu' })
}

function sheet(container) {
  return container.querySelector('dialog.nav-sheet')
}

// jsdom does not implement the modal half of <dialog> (there is no
// showModal at all); these stand in for the browser's: showModal sets
// `open`, close clears it.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})

afterEach(() => {
  delete HTMLDialogElement.prototype.showModal
  delete HTMLDialogElement.prototype.close
  vi.restoreAllMocks()
})

describe('SiteMast', () => {
  it('marks the current page in the nav', () => {
    renderAt('/spine/abc')
    const nav = screen.getByRole('navigation', { name: 'Site' })
    expect(within(nav).getByRole('link', { name: 'Spine' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('links the résumé PDF', () => {
    renderAt()
    expect(screen.getByRole('link', { name: 'Resume ↓' })).toHaveAttribute(
      'href',
      '/resume.pdf',
    )
  })

  it('names the toggle for the theme it switches to', () => {
    const onToggleTheme = vi.fn()
    renderAt('/', { onToggleTheme })
    const toggle = screen.getByRole('button', {
      name: 'Switch to light theme',
    })
    expect(toggle).toHaveTextContent('Light')
    fireEvent.click(toggle)
    expect(onToggleTheme).toHaveBeenCalledOnce()
  })

  it('opens the sheet from Menu and closes it with Close', () => {
    const { container } = renderAt()
    expect(sheet(container)).not.toHaveAttribute('open')
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(menuButton())
    expect(sheet(container)).toHaveAttribute('open')
    expect(menuButton()).toHaveAttribute('aria-expanded', 'true')
    expect(
      within(sheet(container)).getByRole('link', { name: 'About' }),
    ).toBeInTheDocument()

    fireEvent.click(
      within(sheet(container)).getByRole('button', { name: 'Close' }),
    )
    expect(sheet(container)).not.toHaveAttribute('open')
    expect(document.activeElement).toBe(menuButton())
  })

  // Escape fires the dialog's cancel event; the sheet closes and focus goes
  // back to the button that opened it.
  it('closes on Escape and returns focus to Menu', () => {
    const { container } = renderAt()
    fireEvent.click(menuButton())

    fireEvent(sheet(container), new Event('cancel', { cancelable: true }))

    expect(sheet(container)).not.toHaveAttribute('open')
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(menuButton())
  })

  it('closes when a link in the sheet is followed', () => {
    const { container } = renderAt()
    fireEvent.click(menuButton())
    fireEvent.click(
      within(sheet(container)).getByRole('link', { name: 'About' }),
    )
    expect(sheet(container)).not.toHaveAttribute('open')
  })

  // A closed sheet must not put a second "Site" nav on the page.
  it('renders no sheet links while closed', () => {
    const { container } = renderAt()
    expect(sheet(container).querySelector('a')).toBeNull()
  })
})
