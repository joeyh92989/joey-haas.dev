import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useOutletContext } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminLayout from './AdminLayout.jsx'

vi.mock('../lib/useMediaQuery.js', () => ({ useMediaQuery: () => false }))

/** A routed page that shows what the layout handed it. */
function Page() {
  const { items } = useOutletContext()
  return <p data-testid="page">{items ? `${items.length} rows` : 'no rows'}</p>
}

function renderAt(path = '/admin') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Page />} />
          <Route path="collection" element={<Page />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

/** Routes each call by URL, so the order the layout asks in never matters. */
function stubApi({
  me = { email: 'admin@example.com' },
  items = [],
  logout,
  session,
} = {}) {
  const fetch = vi.fn(async (url) => {
    const path = String(url)
    if (path.endsWith('/api/auth/me'))
      return session
        ? session()
        : me
          ? { ok: true, status: 200, json: async () => me }
          : { ok: false, status: 401, json: async () => ({}) }
    if (path.endsWith('/api/items'))
      return { ok: true, status: 200, json: async () => items }
    if (path.endsWith('/api/auth/logout'))
      return logout ?? { ok: true, status: 204 }
    return { ok: false, status: 404, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AdminLayout session states', () => {
  it('offers sign-in, without the shell, when the session check returns 401', async () => {
    stubApi({ me: null })
    renderAt()
    expect(await screen.findByText(/sign in with google/i)).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Admin' })).toBeNull()
    expect(screen.queryByTestId('page')).toBeNull()
    expect(document.title).toBe('Admin · Joey Haas')
  })

  it('renders the page inside the shell once signed in', async () => {
    stubApi()
    renderAt()
    expect(await screen.findByTestId('page')).toBeInTheDocument()
    expect(screen.getByRole('main')).toContainElement(
      screen.getByTestId('page'),
    )
    expect(screen.getByText('admin@example.com')).toBeInTheDocument()
    expect(
      within(screen.getByRole('navigation', { name: 'Admin' })).getByRole(
        'link',
        { name: 'Sources' },
      ),
    ).toHaveAttribute('href', '/admin/catalogue')
  })

  it('gates every admin URL, not just the landing', async () => {
    stubApi({ me: null })
    renderAt('/admin/collection')
    expect(await screen.findByText(/sign in with google/i)).toBeInTheDocument()
    expect(screen.queryByTestId('page')).toBeNull()
  })

  it('explains a rejected account without naming the authorized address', async () => {
    stubApi({ me: null })
    renderAt('/admin?error=access_denied')

    expect(await screen.findByText(/not authorized/i)).toBeInTheDocument()
    // The error must never leak which account would be accepted.
    expect(document.body.textContent).not.toMatch(/josephthaas/i)
  })

  it('stays signed in when sign-out fails, rather than claiming success', async () => {
    // A failed logout leaves a valid 30-day cookie behind. Showing the
    // signed-out view anyway would tell the user they are logged out on a
    // machine where the next visitor still is not.
    const fetch = stubApi({ logout: { ok: false, status: 500 } })
    renderAt()
    ;(await screen.findByRole('button', { name: /sign out/i })).click()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /sign out failed/i,
    )
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/logout'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(screen.queryByText(/sign in with google/i)).not.toBeInTheDocument()
    // The shell and the page stay, so nothing unsaved on it is lost.
    expect(screen.getByTestId('page')).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: 'Admin' }),
    ).toBeInTheDocument()
  })

  it('offers sign-in again after a sign-out the server confirmed', async () => {
    stubApi()
    renderAt()
    ;(await screen.findByRole('button', { name: /sign out/i })).click()
    expect(await screen.findByText(/sign in with google/i)).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Admin' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('main'))
  })

  it('reads a server error on the session check as an error, with a retry', async () => {
    let answer = { ok: false, status: 503, json: async () => ({}) }
    stubApi({ session: () => answer })
    renderAt()
    expect(await screen.findByRole('alert')).toHaveTextContent(/didn’t load/i)
    expect(screen.queryByText(/sign in with google/i)).not.toBeInTheDocument()

    answer = { ok: true, status: 200, json: async () => ({ email: 'a@b.c' }) }
    screen.getByRole('button', { name: 'Try again' }).click()
    expect(await screen.findByTestId('page')).toBeInTheDocument()
  })

  it('reports an unreachable API rather than hanging silently', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    renderAt()
    await waitFor(() =>
      expect(screen.getByText(/didn’t load/i)).toBeInTheDocument(),
    )
  })
})

describe('AdminLayout rows', () => {
  it('counts owned rows beside Shelf, leaving out the want list', async () => {
    stubApi({
      items: [
        { id: 1, owned_format: 'cartridge' },
        { id: 2, owned_format: null },
        { id: 3, owned_format: 'none' },
      ],
    })
    renderAt()
    expect(
      await screen.findByRole('link', { name: 'Shelf, 2 owned' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('page')).toHaveTextContent('3 rows')
  })

  it('keeps the page up when the rows cannot be loaded', async () => {
    const fetch = vi.fn(async (url) =>
      String(url).endsWith('/api/auth/me')
        ? { ok: true, status: 200, json: async () => ({ email: 'a@b.c' }) }
        : { ok: false, status: 500, json: async () => ({}) },
    )
    vi.stubGlobal('fetch', fetch)
    renderAt()
    expect(await screen.findByTestId('page')).toHaveTextContent('no rows')
    expect(screen.getByRole('link', { name: 'Shelf' })).toBeInTheDocument()
  })
})
