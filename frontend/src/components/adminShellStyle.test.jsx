import '@testing-library/jest-dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminShell from './AdminShell.jsx'

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
const css = read('index.css')

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

  it('marks the current area and page by border as well as colour', () => {
    renderAt()
    const rail = screen.getByRole('navigation', { name: 'Areas' })
    const area = within(rail).getByRole('link', { name: 'Shelf' })
    expect(area.className).toContain('aria-[current]:border-')
    const pages = screen.getByRole('navigation', { name: 'Shelf pages' })
    const page = within(pages).getByRole('link', { name: /^Games/ })
    expect(page.className).toContain('aria-[current]:border-')
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

  it('marks the current tab by border as well as colour', () => {
    renderAt('/admin/shelf/games')
    const tabs = screen.getByRole('navigation', { name: 'Areas' })
    expect(
      within(tabs).getByRole('link', { name: 'Shelf' }).className,
    ).toContain('aria-[current]:border-')
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

  it('draws the shell controls with the Button look', () => {
    expect(read('components/adminShellClasses.js')).toContain(
      "from './ui/button-variants.js'",
    )
    for (const file of ['AdminShell', 'AccountMenu']) {
      expect(read(`components/${file}.jsx`)).toContain('adminShellClasses.js')
    }
  })

  it('draws the sign-in link with the Button look', () => {
    expect(read('layouts/AdminLayout.jsx')).toMatch(
      /buttonVariants|adminShellClasses/,
    )
  })

  it('keeps the page frame gutters equal, on a desktop and a phone', () => {
    const gutters = (selector) => {
      const body = css.match(
        new RegExp(`${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`),
      )?.[1]
      expect(body, `a rule for ${selector}`).toBeTruthy()
      const [, top, right, bottom, left] = body
        .match(/padding:\s*([^;]+);/)[1]
        .replace(/\/\*.*\*\//, '')
        .trim()
        .match(/^(\S+)(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+(\S+))?/)
      return [right ?? top, left ?? right ?? top, bottom]
    }
    for (const selector of ['.admin-main', '.admin-app-phone .admin-main']) {
      const [right, left] = gutters(selector)
      expect(right, selector).toBe(left)
    }
  })

  it('has no focus rule that restates what the controls now carry', () => {
    expect(css).not.toMatch(/\.admin-rail a:focus-visible/)
    expect(css).not.toMatch(/\.acct-mark-btn:focus-visible/)
    expect(css).not.toMatch(/\.admin-tabs a:focus-visible/)
  })
})
