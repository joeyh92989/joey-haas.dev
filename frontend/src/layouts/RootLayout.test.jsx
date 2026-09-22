import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useOutletContext } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RootLayout from './RootLayout.jsx'

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

describe('RootLayout wide pages', () => {
  function pageClass(path) {
    const { container } = renderAt(path)
    return container.querySelector('.page').className
  }

  // The tracker pages break out of the reading column; everything else keeps it.
  it.each(['/collection', '/collection/abc', '/admin/collection/abc'])(
    'widens %s',
    (path) => {
      expect(pageClass(path)).toContain('page-wide')
    },
  )

  it.each(['/about', '/', '/admin', '/blog'])('keeps %s narrow', (path) => {
    expect(pageClass(path)).not.toContain('page-wide')
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
