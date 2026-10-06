import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Admin from './Admin.jsx'

function renderAt(path = '/admin') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Admin />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Admin', () => {
  it('offers sign-in when the session check returns 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    renderAt()
    expect(await screen.findByText(/sign in with google/i)).toBeInTheDocument()
  })

  it('shows the signed-in email when the session is valid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ email: 'admin@example.com' }),
      }),
    )
    renderAt()
    expect(await screen.findByText('admin@example.com')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /sign out/i }),
    ).toBeInTheDocument()
  })

  it('links every admin page, the catalogue included', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ email: 'admin@example.com' }),
      }),
    )
    renderAt()
    expect(
      await screen.findByRole('link', { name: 'Catalogue' }),
    ).toHaveAttribute('href', '/admin/catalogue')
    expect(screen.getByRole('link', { name: 'Play Next' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Store list' })).toHaveAttribute(
      'href',
      '/admin/store-list',
    )
  })

  it('explains a rejected account without naming the authorized address', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    renderAt('/admin?error=access_denied')

    expect(await screen.findByText(/not authorized/i)).toBeInTheDocument()
    // The error must never leak which account would be accepted.
    expect(document.body.textContent).not.toMatch(/josephthaas/i)
  })

  it('stays signed in when sign-out fails, rather than claiming success', async () => {
    // A failed logout leaves a valid 30-day cookie behind. Showing the
    // signed-out view anyway would tell the user they are logged out on a
    // machine where the next visitor still is not.
    // Routed by URL, not queued: the landing makes other calls on mount, and a
    // queue would hand the logout call somebody else's response.
    const fetchMock = vi.fn(async (url) => {
      const path = String(url)
      if (path.endsWith('/api/auth/me'))
        return {
          ok: true,
          status: 200,
          json: async () => ({ email: 'admin@example.com' }),
        }
      if (path.endsWith('/api/auth/logout')) return { ok: false, status: 500 }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    renderAt()
    const signOutButton = await screen.findByRole('button', {
      name: /sign out/i,
    })
    signOutButton.click()

    expect(await screen.findByText(/sign out failed/i)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/logout'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(screen.queryByText(/sign in with google/i)).not.toBeInTheDocument()
  })

  it('reports an unreachable API rather than hanging silently', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    renderAt()
    await waitFor(() =>
      expect(screen.getByText(/could not reach the api/i)).toBeInTheDocument(),
    )
  })
})

describe('Admin last nightly line', () => {
  function stubApi(statusBody, statusOk = true, generated = null) {
    const fetch = vi.fn(async (url) => {
      const path = String(url)
      if (path.endsWith('/api/auth/me'))
        return {
          ok: true,
          status: 200,
          json: async () => ({ email: 'a@b.c' }),
        }
      if (path.endsWith('/api/physical/status'))
        return statusOk
          ? { ok: true, status: 200, json: async () => statusBody }
          : { ok: false, status: 500, json: async () => ({}) }
      if (path.endsWith('/api/recommendations/store-list'))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            generated_at: generated ?? { radar: null, discover: null },
          }),
        }
      return { ok: false, status: 404, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  it('shows the latest run once signed in', async () => {
    stubApi({
      sources: [
        {
          source: 'lrg',
          name: 'Limited Run',
          kind: 'store',
          last_run: { finished_at: new Date().toISOString(), ok: false },
        },
      ],
    })
    renderAt()
    expect(await screen.findByText(/failed: Limited Run/)).toBeInTheDocument()
  })

  it('reads the generate times from the store list', async () => {
    const radar = new Date(Date.now() - 3600 * 1000).toISOString()
    const discover = new Date(Date.now() - 1800 * 1000).toISOString()
    const fetch = stubApi(
      {
        sources: [
          {
            source: 'lrg',
            name: 'Limited Run',
            kind: 'store',
            last_run: { finished_at: new Date().toISOString(), ok: true },
          },
        ],
      },
      true,
      { radar, discover },
    )
    const when = new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
    renderAt()
    const line = await screen.findByText(/Last nightly/)
    expect(line).not.toHaveClass('admin-error')
    expect(line).toHaveTextContent(`Radar ${when.format(Date.parse(radar))}`)
    expect(line).toHaveTextContent(
      `Discover ${when.format(Date.parse(discover))}`,
    )
    expect(
      fetch.mock.calls.some(([url]) =>
        String(url).endsWith('/api/recommendations/store-list'),
      ),
    ).toBe(true)
  })

  it('says the job may have stopped when nothing has run', async () => {
    stubApi({ sources: [] })
    renderAt()
    expect(
      await screen.findByText(/Nightly may have stopped/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Nightly may have stopped/)).toHaveClass(
      'admin-error',
    )
    expect(
      screen.getByRole('link', { name: /how to re-enable it/i }),
    ).toHaveAttribute(
      'href',
      'https://github.com/joeyh92989/joey-haas.dev#nightly-job',
    )
  })

  it('asks for nothing else when the status cannot be read', async () => {
    const fetch = stubApi(null, false)
    renderAt()
    await screen.findByText('a@b.c')
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([url]) =>
          String(url).endsWith('/api/physical/status'),
        ),
      ).toBe(true),
    )
    expect(
      fetch.mock.calls.some(([url]) =>
        String(url).includes('/api/recommendations'),
      ),
    ).toBe(false)
    expect(screen.queryByText(/nightly/i)).not.toBeInTheDocument()
  })
})
