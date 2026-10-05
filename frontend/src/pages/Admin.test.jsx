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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ email: 'admin@example.com' }),
      })
      .mockResolvedValueOnce({ ok: false })
    vi.stubGlobal('fetch', fetchMock)

    renderAt()
    const signOutButton = await screen.findByRole('button', {
      name: /sign out/i,
    })
    signOutButton.click()

    expect(await screen.findByText(/sign out failed/i)).toBeInTheDocument()
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
  function stubApi(statusBody) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const path = String(url)
        if (path.endsWith('/api/auth/me'))
          return {
            ok: true,
            status: 200,
            json: async () => ({ email: 'a@b.c' }),
          }
        if (path.endsWith('/api/physical/status'))
          return { ok: true, status: 200, json: async () => statusBody }
        return {
          ok: true,
          status: 200,
          json: async () => ({ generated_at: null }),
        }
      }),
    )
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

  it('says the job may have stopped when nothing has run', async () => {
    stubApi({ sources: [] })
    renderAt()
    expect(
      await screen.findByText(/Nightly may have stopped/),
    ).toBeInTheDocument()
  })
})
