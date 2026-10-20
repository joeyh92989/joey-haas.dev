import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminLayout from '../layouts/AdminLayout.jsx'
import Admin from './Admin.jsx'

vi.mock('../lib/useMediaQuery.js', () => ({ useMediaQuery: () => false }))

// Rendered under its layout, which checks the session first.
function renderAt(path = '/admin') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Admin />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Admin last nightly line', () => {
  function stubApi(statusBody, statusOk = true, generated = null, storeList) {
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
        return (
          storeList ?? {
            ok: true,
            status: 200,
            json: async () => ({
              generated_at: generated ?? { radar: null, discover: null },
            }),
          }
        )
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

  const okStatus = () => ({
    sources: [
      {
        source: 'lrg',
        name: 'Limited Run',
        kind: 'store',
        last_run: { finished_at: new Date().toISOString(), ok: true },
      },
    ],
  })

  it.each([
    ['a failed store list', { ok: false, status: 500, json: async () => ({}) }],
    [
      'a store list that is not JSON',
      {
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token <')
        },
      },
    ],
  ])('shows the line without generate times after %s', async (_, response) => {
    stubApi(okStatus(), true, null, response)
    renderAt()
    const line = await screen.findByText(/Last nightly/)
    expect(line).toHaveTextContent(/catalog .* · ok$/)
    expect(line).not.toHaveTextContent(/Radar|Discover/)
  })

  it('says nothing when the status body has no sources list', async () => {
    const fetch = stubApi({ detail: 'not a status document' })
    renderAt()
    await screen.findByText('a@b.c')
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([url]) =>
          String(url).endsWith('/api/physical/status'),
        ),
      ).toBe(true),
    )
    expect(screen.queryByText(/nightly/i)).not.toBeInTheDocument()
  })

  it('says nothing, and keeps the page, when the status request throws', async () => {
    const fetch = vi.fn(async (url) => {
      if (String(url).endsWith('/api/auth/me'))
        return { ok: true, status: 200, json: async () => ({ email: 'a@b.c' }) }
      throw new TypeError('Failed to fetch')
    })
    vi.stubGlobal('fetch', fetch)
    renderAt()
    await screen.findByText('a@b.c')
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([url]) =>
          String(url).endsWith('/api/physical/status'),
        ),
      ).toBe(true),
    )
    expect(screen.queryByText(/nightly/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sources' })).toBeInTheDocument()
  })
})
