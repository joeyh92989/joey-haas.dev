import '@testing-library/jest-dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminShell from './AdminShell.jsx'

const media = vi.hoisted(() => ({ phone: false }))
vi.mock('../lib/useMediaQuery.js', () => ({
  useMediaQuery: (query) => query === '(max-width: 700px)' && media.phone,
}))

function renderAt(path = '/admin', props = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AdminShell
        email="admin@example.com"
        ownedCount={107}
        onSignOut={() => {}}
        {...props}
      >
        <p>Page body</p>
      </AdminShell>
    </MemoryRouter>,
  )
}

// jsdom has no showModal; these stand in for the browser's.
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
  media.phone = false
  vi.restoreAllMocks()
})

describe('AdminShell sidebar', () => {
  it('lists the groups and their pages in order', () => {
    renderAt()
    const nav = screen.getByRole('navigation', { name: 'Admin' })
    const groups = within(nav)
      .getAllByRole('list')
      .map((list) => [
        list.getAttribute('aria-labelledby') &&
          document.getElementById(list.getAttribute('aria-labelledby'))
            .textContent,
        within(list)
          .getAllByRole('link')
          .map((link) => link.firstChild.textContent),
      ])
    expect(groups).toEqual([
      ['Overview', ['Dashboard']],
      ['Collection', ['Shelf', 'Import photos']],
      ['Recommend', ['Play Next', 'Discover', 'Radar']],
      ['Catalog', ['Sources', 'Store list']],
    ])
  })

  it('keeps every page on its existing URL', () => {
    renderAt()
    const nav = screen.getByRole('navigation', { name: 'Admin' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      '/admin',
      '/admin/collection',
      '/admin/import',
      '/admin/play-next',
      '/admin/discover',
      '/admin/radar',
      '/admin/catalogue',
      '/admin/store-list',
    ])
  })

  it('shows the owned count beside Shelf, and reads it out', () => {
    renderAt()
    expect(
      screen.getByRole('link', { name: 'Shelf, 107 owned' }),
    ).toBeInTheDocument()
  })

  it('leaves the count out until it has loaded', () => {
    renderAt('/admin', { ownedCount: null })
    expect(screen.getByRole('link', { name: 'Shelf' })).toBeInTheDocument()
  })

  it('marks the current page, nested pages included', () => {
    renderAt('/admin/collection/42')
    expect(screen.getByRole('link', { name: /^Shelf/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('shows the account, a way back to the site and sign-out', () => {
    const onSignOut = vi.fn()
    renderAt('/admin', { onSignOut })
    expect(screen.getByText('admin@example.com')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view site/i })).toHaveAttribute(
      'href',
      '/',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it('renders the page in <main>', () => {
    renderAt()
    expect(screen.getByRole('main')).toHaveTextContent('Page body')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
  })
})

describe('AdminShell tab bar', () => {
  function tabs() {
    return screen.getByRole('navigation', { name: 'Admin' })
  }

  it('replaces the sidebar with five tabs on a phone', () => {
    media.phone = true
    renderAt()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(
      [...tabs().querySelectorAll('a, button')].map((tab) => tab.textContent),
    ).toEqual(['Home', 'Shelf', 'Picks', 'Stores', 'More'])
  })

  it('marks the current tab', () => {
    media.phone = true
    renderAt('/admin/collection')
    expect(within(tabs()).getByRole('link', { name: 'Shelf' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      within(tabs()).getByRole('link', { name: 'Home' }),
    ).not.toHaveAttribute('aria-current')
  })

  it('marks the tab whose sheet holds the current page', () => {
    media.phone = true
    renderAt('/admin/radar')
    expect(
      within(tabs()).getByRole('button', { name: 'Picks' }),
    ).toHaveAttribute('aria-current', 'true')
    expect(
      within(tabs()).getByRole('button', { name: 'Stores' }),
    ).not.toHaveAttribute('aria-current')
  })

  it.each([
    ['Picks', ['Play Next', 'Discover', 'Radar']],
    ['Stores', ['Sources', 'Store list']],
    ['More', ['Import photos', 'View site ↗']],
  ])('opens %s as a sheet of its pages', (tab, links) => {
    media.phone = true
    renderAt()
    fireEvent.click(within(tabs()).getByRole('button', { name: tab }))
    const sheet = screen.getByRole('dialog', { name: tab })
    expect(sheet).toHaveAttribute('open')
    expect(
      within(sheet)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(links)
  })

  it('closes a sheet on Escape and returns focus to its tab', () => {
    media.phone = true
    renderAt()
    const tab = within(tabs()).getByRole('button', { name: 'Picks' })
    fireEvent.click(tab)
    expect(tab).toHaveAttribute('aria-expanded', 'true')
    const sheet = screen.getByRole('dialog', { name: 'Picks' })
    fireEvent(sheet, new Event('cancel', { cancelable: true }))
    expect(sheet).not.toHaveAttribute('open')
    expect(tab).toHaveAttribute('aria-expanded', 'false')
    expect(tab).toHaveFocus()
  })

  it('signs out from More', () => {
    media.phone = true
    const onSignOut = vi.fn()
    renderAt('/admin', { onSignOut })
    fireEvent.click(within(tabs()).getByRole('button', { name: 'More' }))
    const sheet = screen.getByRole('dialog', { name: 'More' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledOnce()
    expect(sheet).not.toHaveAttribute('open')
  })
})
