import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SiteHeader from './SiteHeader.jsx'

const ITEMS = [
  { to: '/', label: 'Home', end: true },
  { to: '/about', label: 'About' },
  { to: '/spine', label: 'Spine' },
]

/**
 * jsdom has no layout, so every measurement is 0. Stub the five that the
 * reveal logic reads: a 300px-wide nav scrolling a 500px track, and links 100px
 * wide laid end to end, so link N starts at 100 * N.
 */
function stubLayout({ scrollWidth = 500, clientWidth = 300 } = {}) {
  vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth)
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100)
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(
    function () {
      const links = [...this.parentElement.querySelectorAll('a')]
      return links.indexOf(this) * 100
    },
  )
}

function renderHeader(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SiteHeader
        compact
        isHome={false}
        theme="dark"
        onToggleTheme={() => {}}
        items={ITEMS}
      />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SiteHeader keeps the current item in view', () => {
  // Spine is link 2: it spans 200-300, and with the 32px fade must end by 268
  // of the visible width. Visible width is 300, so scrollLeft = 332 - 300 = 32.
  it('scrolls the nav so the active link clears the fade', () => {
    stubLayout()
    renderHeader('/spine')
    expect(screen.getByRole('navigation', { name: 'Site' }).scrollLeft).toBe(32)
  })

  it('does nothing when the nav does not overflow', () => {
    stubLayout({ scrollWidth: 300, clientWidth: 300 })
    renderHeader('/spine')
    expect(screen.getByRole('navigation', { name: 'Site' }).scrollLeft).toBe(0)
  })

  it('does nothing when the active link is already clear of the fade', () => {
    stubLayout()
    renderHeader('/about')
    expect(screen.getByRole('navigation', { name: 'Site' }).scrollLeft).toBe(0)
  })

  it('brings a focused link past the fade', () => {
    stubLayout()
    renderHeader('/')
    const nav = screen.getByRole('navigation', { name: 'Site' })
    expect(nav.scrollLeft).toBe(0)

    fireEvent.focusIn(screen.getByRole('link', { name: 'Spine' }))

    expect(nav.scrollLeft).toBe(32)
  })

  it('pulls a link hidden on the left back into view', () => {
    stubLayout()
    renderHeader('/spine')
    const nav = screen.getByRole('navigation', { name: 'Site' })

    fireEvent.focusIn(screen.getByRole('link', { name: 'Home' }))

    expect(nav.scrollLeft).toBe(0)
  })

  it('survives a layout engine that reports nothing', () => {
    renderHeader('/spine')
    expect(screen.getByRole('navigation', { name: 'Site' }).scrollLeft).toBe(0)
  })
})
