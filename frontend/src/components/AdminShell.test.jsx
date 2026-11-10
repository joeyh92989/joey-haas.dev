import '@testing-library/jest-dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminShell from './AdminShell.jsx'

const media = vi.hoisted(() => ({ phone: false }))
vi.mock('../lib/useMediaQuery.js', () => ({
  useMediaQuery: (query) => query === '(max-width: 900px)' && media.phone,
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

const areas = () => screen.getByRole('navigation', { name: 'Areas' })

describe('AdminShell on a desktop', () => {
  it('shows a rail of areas, each landing on its home', () => {
    renderAt()
    expect(
      within(areas())
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['⌂Home', '/admin'],
      ['▦Shelf', '/admin/collection'],
      ['◫Closet', '/admin/closet/today'],
      ['◎Denver', '/admin/weekend'],
      ['◇Site', '/admin/analytics'],
    ])
  })

  it('marks the current area, nested pages included', () => {
    renderAt('/admin/collection/42')
    expect(
      within(areas()).getByRole('link', { name: 'Shelf' }),
    ).toHaveAttribute('aria-current', 'true')
    expect(
      within(areas()).getByRole('link', { name: 'Home' }),
    ).not.toHaveAttribute('aria-current')
  })

  it('marks only the longest matching page current', () => {
    renderAt('/admin/closet/profile')
    const list = screen.getByRole('navigation', { name: 'Closet pages' })
    expect(within(list).getByRole('link', { name: 'Profile' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      within(list).getByRole('link', { name: 'Closet' }),
    ).not.toHaveAttribute('aria-current')
  })

  it("marks Closet current on a garment's page", () => {
    renderAt('/admin/closet/12')
    expect(
      within(areas()).getByRole('link', { name: 'Closet' }),
    ).toHaveAttribute('aria-current', 'true')
    const list = screen.getByRole('navigation', { name: 'Closet pages' })
    expect(within(list).getByRole('link', { name: 'Closet' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      within(list).getByRole('link', { name: 'Profile' }),
    ).not.toHaveAttribute('aria-current')
  })

  it("lists the current area's pages under their kickers", () => {
    renderAt('/admin/radar')
    const nav = screen.getByRole('navigation', { name: 'Shelf pages' })
    const groups = within(nav)
      .getAllByRole('list')
      .map((list) => [
        document.getElementById(list.getAttribute('aria-labelledby'))
          .textContent,
        within(list)
          .getAllByRole('link')
          .map((link) => link.firstChild.textContent),
      ])
    expect(groups).toEqual([
      ['Collection', ['Collection', 'Import photos']],
      ['Recommend', ['Play Next', 'Discover', 'Radar', 'Pull list']],
      ['Catalogue', ['Sources', 'Store list']],
    ])
    expect(within(nav).getByRole('link', { name: 'Radar' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('titles the page list with the area and its description', () => {
    renderAt('/admin/weekend')
    expect(screen.getByText('spots and weekends')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Denver pages' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/admin/weekend', '/admin/spots'])
  })

  it('lists Jobs under Site too, without leaving Home', () => {
    renderAt('/admin/jobs')
    expect(within(areas()).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(
      within(screen.getByRole('navigation', { name: 'Home pages' })).getByRole(
        'link',
        { name: 'Jobs' },
      ),
    ).toHaveAttribute('aria-current', 'page')
  })

  it('shows the owned count beside Collection, and reads it out', () => {
    renderAt('/admin/collection')
    expect(
      screen.getByRole('link', { name: 'Collection, 107 owned' }),
    ).toBeInTheDocument()
  })

  it('leaves the count out until it has loaded', () => {
    renderAt('/admin/collection', { ownedCount: null })
    expect(
      within(screen.getByRole('navigation', { name: 'Shelf pages' })).getByRole(
        'link',
        { name: 'Collection' },
      ),
    ).toBeInTheDocument()
  })

  it("reads an area's badge as part of its name", () => {
    renderAt('/admin', { badges: { site: { value: 2, words: 'jobs failed' } } })
    expect(
      within(areas()).getByRole('link', { name: 'Site, 2 jobs failed' }),
    ).toBeInTheDocument()
  })

  it('shows the account, a way back to the site and sign-out', () => {
    const onSignOut = vi.fn()
    renderAt('/admin', { onSignOut })
    expect(screen.getByText('admin@example.com')).toBeInTheDocument()
    expect(
      screen
        .getAllByRole('link', { name: /view site/i })
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/', '/'])
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it('renders the page in <main>', () => {
    renderAt()
    expect(screen.getByRole('main')).toHaveTextContent('Page body')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
  })
})

describe('AdminShell on a phone', () => {
  beforeEach(() => {
    media.phone = true
  })

  it('replaces the rail and page list with a tab bar of areas', () => {
    renderAt()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(
      within(areas())
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      '/admin',
      '/admin/collection',
      '/admin/closet/today',
      '/admin/weekend',
      '/admin/analytics',
    ])
  })

  it('marks the current area tab', () => {
    renderAt('/admin/spots')
    expect(
      within(areas()).getByRole('link', { name: 'Denver' }),
    ).toHaveAttribute('aria-current', 'true')
  })

  it("shows the area's pages as segments, the current one marked", () => {
    renderAt('/admin/spots')
    const sub = screen.getByRole('navigation', { name: 'Denver pages' })
    expect(within(sub).getByRole('link', { name: 'Spots' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      within(sub)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Weekend', 'Spots'])
  })

  it('marks only Profile among the segments on the profile page', () => {
    renderAt('/admin/closet/profile')
    const sub = screen.getByRole('navigation', { name: 'Closet pages' })
    expect(within(sub).getByRole('link', { name: 'Profile' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      within(sub).getByRole('link', { name: 'Closet' }),
    ).not.toHaveAttribute('aria-current')
  })

  it("marks the Closet segment on a garment's page", () => {
    renderAt('/admin/closet/12')
    const sub = screen.getByRole('navigation', { name: 'Closet pages' })
    expect(within(sub).getByRole('link', { name: 'Closet' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('gives Shelf two pages and two sheets', () => {
    renderAt('/admin/collection')
    const sub = screen.getByRole('navigation', { name: 'Shelf pages' })
    expect(
      [...sub.querySelectorAll('a, button')].map((el) => el.textContent),
    ).toEqual(['Collection', 'Picks', 'Sources', 'More'])
  })

  it('marks the segment whose sheet holds the current page', () => {
    renderAt('/admin/radar')
    const sub = screen.getByRole('navigation', { name: 'Shelf pages' })
    expect(within(sub).getByRole('button', { name: 'Picks' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(
      within(sub).getByRole('button', { name: 'More' }),
    ).not.toHaveAttribute('aria-current')
  })

  it.each([
    ['Picks', ['Play Next', 'Discover', 'Radar', 'Pull list']],
    ['More', ['Import photos', 'Store list']],
  ])('opens %s as a sheet of its pages', (label, links) => {
    renderAt('/admin/collection')
    fireEvent.click(screen.getByRole('button', { name: label }))
    const sheet = screen.getByRole('dialog', { name: label })
    expect(sheet).toHaveAttribute('open')
    expect(
      within(sheet)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(links)
  })

  it('closes a sheet on Escape and returns focus to its segment', () => {
    renderAt('/admin/collection')
    const button = screen.getByRole('button', { name: 'Picks' })
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    const sheet = screen.getByRole('dialog', { name: 'Picks' })
    fireEvent(sheet, new Event('cancel', { cancelable: true }))
    expect(sheet).not.toHaveAttribute('open')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveFocus()
  })

  it('closes an open sheet when the width leaves the phone layout', () => {
    // A new element each time: React skips a rerender of the same one.
    const tree = () => (
      <MemoryRouter initialEntries={['/admin/collection']}>
        <AdminShell email={null} ownedCount={null} onSignOut={() => {}}>
          <p>Page body</p>
        </AdminShell>
      </MemoryRouter>
    )
    const { rerender } = render(tree())
    fireEvent.click(screen.getByRole('button', { name: 'Picks' }))
    media.phone = false
    rerender(tree())
    media.phone = true
    rerender(tree())
    expect(screen.getByRole('button', { name: 'Picks' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('signs out from the foot of the page', () => {
    const onSignOut = vi.fn()
    renderAt('/admin', { onSignOut })
    fireEvent.click(
      within(screen.getByRole('main')).getByRole('button', {
        name: 'Sign out',
      }),
    )
    expect(onSignOut).toHaveBeenCalledOnce()
  })
})
