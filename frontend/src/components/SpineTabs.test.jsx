import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

// The build found an empty comics snapshot (#125).
vi.mock('../lib/snapshotPresence.js', () => ({
  hasComics: false,
  hasSpots: true,
}))

const { default: SpineTabs } = await import('./SpineTabs.jsx')

function renderTabs(props) {
  return render(
    <MemoryRouter initialEntries={['/shelf']}>
      <SpineTabs {...props} />
    </MemoryRouter>,
  )
}

describe('SpineTabs', () => {
  it('leaves Comics out when the build says there are none', () => {
    renderTabs()
    expect(screen.queryByRole('link', { name: 'Comics' })).toBeNull()
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(
      ['Collection', 'What’s next', 'Year in review', 'Tour', 'Daily game'],
    )
  })

  it('shows Comics when told to', () => {
    renderTabs({ comics: true })
    expect(screen.getByRole('link', { name: 'Comics' })).toHaveAttribute(
      'href',
      '/shelf/comics',
    )
  })

  it('scrolls only its own row to a current tab hidden by the fade', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const scrolled = vi.fn()
    const spies = [
      vi
        .spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
        .mockReturnValue(600),
      vi
        .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
        .mockReturnValue(300),
      vi
        .spyOn(HTMLElement.prototype, 'scrollLeft', 'set')
        .mockImplementation(scrolled),
      // The row starts at 0; the current tab (Daily) is at 500, 80 wide.
      vi
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockImplementation(function box() {
          const tab = this.matches('a.active')
          return { left: tab ? 500 : 0, width: tab ? 80 : 300 }
        }),
    ]
    render(
      <MemoryRouter initialEntries={['/daily']}>
        <SpineTabs />
      </MemoryRouter>,
    )
    // The tab ends at 580; the row shows 300 wide, so it scrolls to 280.
    expect(scrolled).toHaveBeenCalledWith(280)
    expect(scrollIntoView).not.toHaveBeenCalled()
    for (const spy of spies) spy.mockRestore()
    delete Element.prototype.scrollIntoView
  })
})
