import '@testing-library/jest-dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AccountMenu from './AccountMenu.jsx'
import AdminShell from './AdminShell.jsx'
import { signInLink } from './adminShellClasses.js'
import { buttonVariants } from './ui/button-variants.js'
import { readCss } from '../testing/readCss.js'

// The admin shell (#535, slice 1) is drawn from the Button look
// (`ui/button-variants.js`), like the public shell (#529). These tests pin
// what the look must keep: a visible focus ring on every control, the
// current page marked by more than colour, the eager files off Base UI, and
// the page frame's two gutters equal.

const media = vi.hoisted(() => ({ phone: false }))
vi.mock('../lib/useMediaQuery.js', () => ({
  useMediaQuery: (query) => query === '(max-width: 900px)' && media.phone,
}))

const here = dirname(fileURLToPath(import.meta.url))
const read = (path) => readFileSync(join(here, '..', path), 'utf8')
// Read from disk: Vitest stubs CSS imports.
const css = readCss()

function renderAt(path = '/admin/shelf/games') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AdminShell email="admin@example.com" ownedCount={3} onSignOut={() => {}}>
        <p>Page body</p>
      </AdminShell>
    </MemoryRouter>,
  )
}

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
})

// The Button look's ring: an outline that is `solid`, because Tailwind's
// `outline-2` alone sets a width and leaves the style `none`.
const RING = 'focus-visible:outline-solid'

function expectRing(...elements) {
  for (const element of elements) {
    expect(element.className, element.outerHTML).toContain(RING)
  }
}

describe('admin shell on a desktop', () => {
  it('gives the account trigger, rail links and page links a focus ring', () => {
    renderAt()
    const trigger = screen.getByRole('button', { name: /^Account/ })
    const rail = screen.getByRole('navigation', { name: 'Areas' })
    const pages = screen.getByRole('navigation', { name: 'Shelf pages' })
    expectRing(
      trigger,
      ...within(rail).getAllByRole('link'),
      ...within(pages).getAllByRole('link'),
    )
  })

  it('gives the account menu rows a focus ring', () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: /^Account/ }))
    expectRing(
      screen.getByRole('link', { name: /View site/ }),
      screen.getByRole('button', { name: 'Sign out' }),
    )
  })

  it('marks the current area and page through aria-current, with a border and fill to match', () => {
    renderAt()
    const rail = screen.getByRole('navigation', { name: 'Areas' })
    const pages = screen.getByRole('navigation', { name: 'Shelf pages' })
    const links = [
      ...within(rail).getAllByRole('link'),
      ...within(pages).getAllByRole('link'),
    ]
    for (const link of links) {
      const current = link.hasAttribute('aria-current')
      // The classes only bite on an element that carries the attribute, so
      // the pair (attribute, classes) is what is checked: the current link
      // has both, and no other link has the attribute.
      expect(link.className).toContain('aria-[current]:border-foreground')
      expect(link.className).toContain('aria-[current]:bg-card')
      expect(current, link.textContent).toBe(
        ['Shelf', 'Games'].some((name) => link.textContent.includes(name)),
      )
    }
  })

  it('draws every link and trigger from the ghost Button look, with a visible hover', () => {
    renderAt()
    const ghost = buttonVariants({ variant: 'ghost', size: 'bare' })
    const rail = screen.getByRole('navigation', { name: 'Areas' })
    const pages = screen.getByRole('navigation', { name: 'Shelf pages' })
    for (const el of [
      screen.getByRole('button', { name: /^Account/ }),
      ...within(rail).getAllByRole('link'),
      ...within(pages).getAllByRole('link'),
    ]) {
      expect(el.className, el.outerHTML).toContain(ghost)
      // --sunken (ghost's hover) is the rail's own fill: hover is --surface.
      expect(el.className, el.outerHTML).toContain('hover:bg-card!')
    }
  })

  it('reads a pending sign-out as disabled: default cursor, no hover fill', () => {
    render(
      <MemoryRouter>
        <AccountMenu
          email="admin@example.com"
          variant="rail"
          onSignOut={() => {}}
          pending
        />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Account/ }))
    const row = screen.getByRole('button', { name: 'Signing out…' })
    expect(row).toHaveAttribute('aria-disabled', 'true')
    expect(row.className).toContain('aria-disabled:cursor-default!')
    expect(row.className).toContain('aria-disabled:hover:bg-transparent!')
  })
})

describe('admin shell on a phone', () => {
  beforeEach(() => {
    media.phone = true
  })

  it('gives the tab bar, the segments and the account pill a focus ring', () => {
    renderAt('/admin/shelf/games')
    const tabs = screen.getByRole('navigation', { name: 'Areas' })
    const segments = screen.getByRole('navigation', { name: 'Shelf pages' })
    expectRing(
      screen.getByRole('button', { name: /^Account/ }),
      ...within(tabs).getAllByRole('link'),
      ...within(segments).getAllByRole('link'),
      ...within(segments).getAllByRole('button'),
    )
  })

  it('marks the current tab through aria-current; the others carry none', () => {
    renderAt('/admin/shelf/games')
    const tabs = screen.getByRole('navigation', { name: 'Areas' })
    const current = within(tabs)
      .getAllByRole('link')
      .filter((link) => link.hasAttribute('aria-current'))
    expect(current.map((link) => link.textContent)).toEqual(['▦Shelf'])
    expect(current[0].className).toContain('aria-[current]:border-foreground')
  })

  it('keeps segments at weight 400 until current, with side padding that fits 320px', () => {
    renderAt('/admin/shelf/games')
    const segments = screen.getByRole('navigation', { name: 'Shelf pages' })
    for (const el of [
      ...within(segments).getAllByRole('link'),
      ...within(segments).getAllByRole('button'),
    ]) {
      expect(el.className).toContain('font-normal!')
      expect(el.className).toContain('aria-[current]:font-medium!')
      expect(el.className).toContain('px-1 ')
      expect(el.className).not.toMatch(/(^| )h-8( |$)/)
    }
  })
})

describe('admin shell source', () => {
  const EAGER = [
    'components/AdminShell.jsx',
    'components/AccountMenu.jsx',
    'components/AdminPageHeader.jsx',
    'components/adminShellClasses.js',
    'layouts/AdminLayout.jsx',
  ]

  it.each(EAGER)(
    '%s stays off Base UI, cn, clsx and tailwind-merge',
    (file) => {
      const text = read(file)
      expect(text).not.toMatch(/ui\/button\.jsx|@base-ui|from 'cn'/)
      expect(text).not.toMatch(/clsx|tailwind-merge/)
    },
  )

  it.each(EAGER)('%s sets no opacity on coloured text', (file) => {
    expect(read(file)).not.toMatch(/text-[\w-]+\/\d/)
  })

  it('draws the sign-in link with the Button look', () => {
    expect(signInLink).toBe(buttonVariants({ variant: 'outline', size: 'lg' }))
    expect(read('layouts/AdminLayout.jsx')).toContain('signInLink')
  })

  it('has no focus rule that restates what the controls now carry', () => {
    for (const selector of [
      '.admin-rail a:focus-visible',
      '.admin-subnav a:focus-visible',
      '.admin-subnav button:focus-visible',
      '.admin-side-nav a:focus-visible',
      '.acct-mark-btn:focus-visible',
      '.acct-btn:focus-visible',
      '.acct-list a:focus-visible',
      '.acct-list button:focus-visible',
      '.admin-tabs a:focus-visible',
    ]) {
      expect(css, selector).not.toContain(selector)
    }
  })

  it('keeps no rule for the classes the shell no longer renders', () => {
    for (const selector of ['.acct-btn', '.acct-mark-btn', '.admin-signin']) {
      expect(css, selector).not.toContain(selector)
    }
  })
})
