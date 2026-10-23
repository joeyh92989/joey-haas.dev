import '@testing-library/jest-dom'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import {
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useOutletContext,
} from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RootLayout from './RootLayout.jsx'

// posts.js globs frontend/posts/*.md, and the Vitest config has no markdown
// plugin, so the module is replaced. Tests push onto this array to publish.
const content = vi.hoisted(() => ({ posts: [] }))
vi.mock('../content/posts.js', () => content)

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RootLayout />
    </MemoryRouter>,
  )
}

/** The toggle is labelled by its action, and named for the theme it switches to. */
function toggle(target) {
  return screen.getByRole('button', { name: `Switch to ${target} theme` })
}

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

afterEach(() => {
  localStorage.clear()
  content.posts.length = 0
  vi.restoreAllMocks()
})

describe('RootLayout theme toggle', () => {
  it('defaults to dark when nothing is stored', () => {
    renderAt()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(toggle('light')).toHaveTextContent('Light')
  })

  it('restores a stored preference', () => {
    localStorage.setItem('theme', 'light')
    renderAt()
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(toggle('dark')).toHaveTextContent('Dark')
  })

  // A stray value must not leave the page on a theme with no token block.
  it('falls back to dark when the stored value is not a theme', () => {
    localStorage.setItem('theme', 'solarized')
    renderAt()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('flips the theme on click and persists the choice', () => {
    renderAt()

    fireEvent.click(toggle('light'))

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('theme')).toBe('light')
    expect(toggle('dark')).toBeInTheDocument()
  })

  // Nothing is stored until the visitor chooses: writing the default on mount
  // would pin everyone to it if the default ever changed.
  it('does not persist a theme the visitor never chose', () => {
    renderAt()
    expect(localStorage.getItem('theme')).toBeNull()
  })

  // Storage throws outright in some private-browsing modes. An uncaught throw
  // here would blank the layout on every route.
  it('still renders and toggles when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })

    renderAt()
    expect(document.documentElement.dataset.theme).toBe('dark')

    fireEvent.click(toggle('light'))
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})

describe('RootLayout page widths', () => {
  function pageClass(path) {
    const { container } = renderAt(path)
    return container.querySelector('main').className
  }

  // The tracker pages break out to 72rem; everything nested under one too.
  it.each(['/shelf', '/shelf/abc', '/shelf/year/2026'])('widens %s', (path) => {
    expect(pageClass(path)).toBe('page page-wide')
  })

  // Cards and columns take the masthead's 1040px measure.
  it.each(['/', '/about', '/projects', '/about/'])(
    'gives %s the content width',
    (path) => {
      expect(pageClass(path)).toBe('page page-content')
    },
  )

  // Prose keeps the reading column, including pages nested under a content
  // route's path.
  it.each(['/blog', '/blog/x', '/now', '/colophon', '/about/x'])(
    'keeps %s to the reading column',
    (path) => {
      expect(pageClass(path)).toBe('page')
    },
  )

  // The masthead and footer rows follow the page out on the tracker routes.
  it('widens the chrome with the tracker pages only', () => {
    const { container, unmount } = renderAt('/shelf')
    expect(container.firstChild).toHaveClass('site-wide')
    unmount()
    expect(renderAt('/about').container.firstChild).not.toHaveClass('site-wide')
  })
})

describe('RootLayout outlet context', () => {
  function Probe() {
    return <p>signed in: {String(useOutletContext().signedIn)}</p>
  }

  function renderProbe() {
    return render(
      <MemoryRouter initialEntries={['/probe']}>
        <Routes>
          <Route element={<RootLayout />}>
            <Route path="/probe" element={<Probe />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
  }

  // Routed pages read the session the layout already fetched, rather than
  // each asking /api/auth/me again.
  it('is false until the session check resolves ok, then true', async () => {
    let resolve
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )

    renderProbe()
    expect(screen.getByText('signed in: false')).toBeInTheDocument()

    resolve(new Response('{}', { status: 200 }))
    expect(await screen.findByText('signed in: true')).toBeInTheDocument()
  })

  it('stays false when the session check fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 401 }),
    )

    renderProbe()
    // Let the rejected check settle before asserting nothing changed.
    await Promise.resolve()
    expect(screen.getByText('signed in: false')).toBeInTheDocument()
  })
})

describe('RootLayout nav', () => {
  function navLabels() {
    return within(screen.getByRole('navigation'))
      .getAllByRole('link')
      .map((link) => link.textContent)
  }

  it('lists Spine, and no Blog while nothing is published', () => {
    renderAt('/about')
    expect(navLabels()).toEqual(['Home', 'About', 'Projects', 'My Shelf'])
  })

  it('adds Blog last once a post is published', () => {
    content.posts.push({
      slug: 'first',
      frontmatter: { title: 'First', date: '2026-10-01' },
    })
    renderAt('/about')
    expect(navLabels()).toEqual([
      'Home',
      'About',
      'Projects',
      'My Shelf',
      'Blog',
    ])
  })

  it('keeps Spine current on an item page', () => {
    renderAt('/shelf/abc')
    expect(
      within(screen.getByRole('navigation')).getByRole('link', {
        name: 'My Shelf',
      }),
    ).toHaveAttribute('aria-current', 'page')
  })
})

describe('RootLayout footer', () => {
  it('credits the current year and links the source', () => {
    renderAt('/about')
    const footer = screen.getByRole('contentinfo')
    expect(footer).toHaveTextContent(`© ${new Date().getFullYear()} Joey Haas`)
    expect(
      within(footer).getByRole('link', { name: 'Source' }),
    ).toHaveAttribute('href', 'https://github.com/joeyh92989/joey-haas.dev')
  })

  it('keeps the contact links and the sign-in door', () => {
    renderAt('/about')
    const footer = within(screen.getByRole('contentinfo'))
    expect(footer.getByRole('link', { name: 'GitHub' })).toBeInTheDocument()
    expect(footer.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })
})

describe('RootLayout admin routes', () => {
  // The admin shell brings its own frame, so the public one steps aside.
  it.each(['/admin', '/admin/collection/abc'])(
    'renders no masthead or footer on %s',
    (path) => {
      const { container } = renderAt(path)
      expect(container.querySelector('.mast')).toBeNull()
      expect(container.querySelector('.site-footer')).toBeNull()
      expect(container.firstChild).toHaveClass('site-admin')
      expect(screen.getByRole('link', { name: /skip to/i })).toBeInTheDocument()
    },
  )
})

describe('RootLayout masthead', () => {
  // One masthead everywhere: the tracker no longer gets a compact variant.
  it.each(['/', '/about', '/shelf', '/shelf/next'])(
    'is the same masthead on %s',
    (path) => {
      const { container } = renderAt(path)
      expect(container.querySelectorAll('.mast')).toHaveLength(1)
      expect(screen.getByRole('link', { name: /Joey Haas/ })).toHaveAttribute(
        'href',
        '/',
      )
    },
  )

  it('keeps Spine current on What’s next', () => {
    renderAt('/shelf/next')
    expect(screen.getByRole('link', { name: 'My Shelf' })).toHaveClass('active')
  })

  it('keeps the toggle outside the nav landmark', () => {
    renderAt('/shelf')
    const nav = screen.getByRole('navigation', { name: /site/i })
    expect(within(nav).queryByRole('button')).toBeNull()
  })
})

function Boom() {
  throw new Error('render failed')
}

function routedAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RootLayout />}>
          <Route path="/" element={<h1>Home page</h1>} />
          <Route path="/about" element={<h1>About page</h1>} />
          <Route path="/broken" element={<Boom />} />
          <Route path="/old" element={<Navigate to="/about" replace />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('RootLayout route changes', () => {
  it('offers a skip link to the main content', () => {
    renderAt('/')
    const skip = screen.getByRole('link', { name: 'Skip to content' })
    expect(skip).toHaveAttribute('href', '#main')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
  })

  it('leaves focus and scroll alone on the first page', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    routedAt('/')
    expect(scroll).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.body)
  })

  it('scrolls to the top and focuses the new page heading', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    routedAt('/')
    fireEvent.click(screen.getByRole('link', { name: 'About' }))
    const heading = screen.getByRole('heading', { name: 'About page' })
    expect(scroll).toHaveBeenCalledWith(0, 0)
    expect(document.activeElement).toBe(heading)
    expect(heading).toHaveAttribute('tabindex', '-1')
  })

  it('treats a redirect as part of the first load', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    routedAt('/old')
    expect(screen.getByRole('heading', { name: 'About page' })).toBeVisible()
    expect(scroll).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.body)
  })

  it('keeps the chrome up when a page fails to render', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    routedAt('/broken')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This page hit a problem',
    )
    expect(
      screen.getByRole('navigation', { name: /site/i }),
    ).toBeInTheDocument()
  })

  it('clears a page error on the next navigation', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    routedAt('/broken')
    fireEvent.click(screen.getByRole('link', { name: 'About' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(
      screen.getByRole('heading', { name: 'About page' }),
    ).toBeInTheDocument()
  })
})

describe('RootLayout analytics beacon', () => {
  let beacon

  beforeEach(() => {
    beacon = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', {
      value: beacon,
      configurable: true,
    })
  })

  afterEach(() => {
    delete navigator.sendBeacon
  })

  const paths = () => beacon.mock.calls.map(([, body]) => JSON.parse(body).path)
  const navTo = (name) =>
    fireEvent.click(
      within(screen.getByRole('navigation')).getByRole('link', { name }),
    )

  it('waits for the session check, then sends one per navigation', async () => {
    let resolve
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    renderAt('/')
    await Promise.resolve()
    expect(beacon).not.toHaveBeenCalled()

    resolve(new Response('{}', { status: 401 }))
    await waitFor(() => expect(paths()).toEqual(['/']))
    navTo('About')
    navTo('Projects')
    expect(paths()).toEqual(['/', '/about', '/projects'])
  })

  it('counts a session check that throws as signed out', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError('Failed to fetch'),
    )
    renderAt('/about')
    await waitFor(() => expect(paths()).toEqual(['/about']))
  })

  it('sends nothing for a signed-in visit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 }),
    )
    renderAt('/')
    expect(
      await screen.findByRole('link', { name: 'Admin' }),
    ).toBeInTheDocument()
    expect(beacon).not.toHaveBeenCalled()
  })
})
