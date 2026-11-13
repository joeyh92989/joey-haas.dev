import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import AdminComic from './AdminComic.jsx'

const COMIC = {
  id: 'abc',
  type: 'comic',
  title: 'Waterworld: Children of Leviathan',
  status: 'backlog',
  rating: null,
  notes: 'private words',
  is_public: true,
  favorite: false,
  following: false,
  year: 1997,
  creator: 'Acclaim',
  cover_url: null,
  external_source: 'comicvine',
  external_id: '22918',
  owned_format: 'physical',
  issues_owned: '1–4',
  issues_skipped: '6',
  editions: [],
  read_to: null,
  source_metadata: { publisher: 'Acclaim', issue_count: 4 },
  comic_run: { owned: 4, released: 4, missing: 0, read: 0 },
  playthroughs: [],
}

const ROWS = [1, 2, 3, 4, 5].map((n) => ({
  number: n,
  name: null,
  store_date: null,
  cover_url: null,
  owned: n <= 4,
  read: false,
}))

const WALL = {
  wall: {
    series_title: 'Waterworld',
    publisher: 'Acclaim',
    issues: ROWS,
    editions: [],
  },
  comic: {
    owned_text: '1–4',
    released: 5,
    read_to: null,
    read: 0,
    next_issue: null,
    editions: [],
  },
}

/** The API: reads answer, writes are recorded and answer ok. */
function stubApi({ item = COMIC, wall = WALL, fail = {} } = {}) {
  const writes = []
  const fetch = vi.fn(async (url, options = {}) => {
    const path = String(url)
    const method = options.method ?? 'GET'
    if (method === 'GET') {
      if (path.endsWith('/wall'))
        return { ok: true, status: 200, json: async () => wall }
      if (path.includes('search-metadata'))
        return { ok: true, status: 200, json: async () => [] }
      return { ok: true, status: 200, json: async () => item }
    }
    if (path.endsWith('/api/items/delete-preview')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: 1,
          playthroughs: 0,
          play_sessions: 0,
          comic_issues: 5,
          pick_events: 0,
          titles: [item.title],
        }),
      }
    }
    writes.push([method, path, options.body ? JSON.parse(options.body) : null])
    const refusal = Object.entries(fail).find(([key]) => path.includes(key))
    if (refusal)
      return {
        ok: false,
        status: refusal[1].status,
        json: async () => ({ detail: refusal[1].detail }),
      }
    return {
      ok: true,
      status: 200,
      json: async () => ({ ...item, ...JSON.parse(options.body ?? '{}') }),
    }
  })
  vi.stubGlobal('fetch', fetch)
  return { fetch, writes }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/shelf/comics/abc']}>
      <Routes>
        <Route path="/admin/shelf/comics/:id" element={<AdminComic />} />
        <Route path="/admin/collection/:id" element={<p>the game page</p>} />
        <Route path="/admin/shelf/comics" element={<p>the comics list</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('AdminComic', () => {
  it('has the panels, a breadcrumb and no range field or run cells', async () => {
    stubApi()
    renderPage()
    expect(
      await screen.findByRole('heading', { level: 1, name: COMIC.title }),
    ).toBeInTheDocument()
    for (const name of [
      'Series',
      'Issues',
      'Editions',
      'Comic Vine match',
      'Delete',
    ])
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(trail).getByRole('link', { name: 'Comics' })).toHaveAttribute(
      'href',
      '/admin/shelf/comics',
    )
    // The range text, the read-to number and the run cells are gone.
    expect(screen.queryByLabelText('Single issues I own')).toBeNull()
    expect(screen.queryByLabelText('Read to')).toBeNull()
    expect(screen.queryByLabelText(/^Skipped/)).toBeNull()
    expect(document.querySelector('.run-box, .comic-run-editor')).toBeNull()
    expect(screen.queryByRole('button', { name: /Pin as Up next/ })).toBeNull()
    expect(screen.queryByLabelText('Platform')).toBeNull()
    expect(screen.queryByLabelText('Format')).toBeNull()
    expect(screen.queryByText('Minutes')).toBeNull()
  })

  it('draws the same wall with taps, and a tap posts to the mark route', async () => {
    const { writes } = stubApi()
    renderPage()
    await userEvent.click(
      await screen
        .findByRole('button', {
          name: `${COMIC.title}, Missing. Mark owned`,
        })
        .catch(() => screen.findByRole('button', { name: /#5, Missing/ })),
    )
    await waitFor(() => expect(writes.length).toBe(1))
    expect(writes[0]).toEqual([
      'POST',
      expect.stringContaining('/api/comics/abc/issues/5/mark'),
      { state: 'owned' },
    ])
  })

  it('shows the owner’s skip on the wall', async () => {
    stubApi()
    renderPage()
    expect(
      await screen.findByRole('button', { name: /#5, Missing/ }),
    ).toBeInTheDocument()
  })

  it('links to the site only when public, and a private series has no issue links', async () => {
    stubApi({ item: { ...COMIC, is_public: false } })
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('link', { name: 'View on the site' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Open Waterworld/ })).toBeNull()
    expect(screen.getByText(/Private/)).toBeInTheDocument()
  })

  it('links to the public page when public', async () => {
    stubApi()
    renderPage()
    expect(
      await screen.findByRole('link', { name: 'View on the site' }),
    ).toHaveAttribute('href', '/shelf/abc/')
    expect(
      screen.getAllByRole('link', { name: /Open .* #1/ })[0],
    ).toHaveAttribute('href', '/shelf/abc/1/')
  })

  it('saves only the series fields that changed', async () => {
    const { writes } = stubApi()
    renderPage()
    await userEvent.type(await screen.findByLabelText('Rating'), '8')
    await userEvent.click(screen.getByLabelText('Following'))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0][0]).toBe('PATCH')
    expect(writes[0][2]).toEqual({ rating: 8, following: true })
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
  })

  it('says nothing changed rather than sending an empty save', async () => {
    const { writes } = stubApi()
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Save changes' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nothing has changed.',
    )
    expect(writes).toHaveLength(0)
  })

  it('shows the server’s refusal for a fifth favorite', async () => {
    stubApi({
      fail: {
        '/api/items/abc': { status: 409, detail: 'Four favorites at most.' },
      },
    })
    renderPage()
    await userEvent.click(await screen.findByLabelText('Favorite'))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Four favorites at most.',
    )
  })

  it('moves the status through the status route', async () => {
    const { writes } = stubApi()
    renderPage()
    await userEvent.selectOptions(
      await screen.findByLabelText('Status'),
      'Reading',
    )
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0][1]).toContain('/api/items/abc/status')
  })

  it('saves editions without sending any range field', async () => {
    const { writes } = stubApi()
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add an edition' }),
    )
    await userEvent.type(screen.getByLabelText('Kind, edition 1'), 'Trade')
    await userEvent.type(screen.getByLabelText('From issue, edition 1'), '1')
    await userEvent.type(screen.getByLabelText('To issue, edition 1'), '4')
    await userEvent.type(screen.getByLabelText('Label, edition 1'), 'Book 1')
    await userEvent.click(screen.getByRole('button', { name: 'Save editions' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0][2]).toEqual({
      editions: [{ kind: 'Trade', label: 'Book 1', from: 1, to: 4 }],
    })
  })

  it('refreshes from Comic Vine', async () => {
    const { writes } = stubApi()
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Refresh from Comic Vine' }),
    )
    await waitFor(() =>
      expect(writes[0][1]).toContain('/api/comics/abc/refresh'),
    )
  })

  it('says so for a series not linked to Comic Vine', async () => {
    stubApi({ item: { ...COMIC, external_source: null, external_id: null } })
    renderPage()
    expect(
      await screen.findByText('Not linked to Comic Vine.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Refresh from Comic Vine' }),
    ).toBeNull()
  })

  it('confirms before it deletes, then goes back to the list', async () => {
    const { writes } = stubApi()
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: `Delete ${COMIC.title}` }),
    )
    await userEvent.click(
      await screen.findByRole('button', {
        name: `Delete ${COMIC.title} for good`,
      }),
    )
    expect(await screen.findByText('the comics list')).toBeInTheDocument()
    expect(writes.at(-1)).toEqual([
      'DELETE',
      expect.stringContaining('/api/items/abc'),
      null,
    ])
  })

  it('sends a game to its own page', async () => {
    stubApi({ item: { ...COMIC, type: 'game' } })
    renderPage()
    expect(await screen.findByText('the game page')).toBeInTheDocument()
  })

  it('adds an issue by number, owned, whether or not Comic Vine lists it', async () => {
    const { writes } = stubApi()
    renderPage()
    await userEvent.type(await screen.findByLabelText('Add issue #'), '9999')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toEqual([
      'POST',
      expect.stringContaining('/api/comics/abc/issues/9999/mark'),
      { state: 'owned' },
    ])
    expect(screen.getByText(/whole number from 1 to 9999/)).toBeVisible()
  })

  it('refuses a number outside 1 to 9999 before sending anything', async () => {
    const { writes } = stubApi()
    renderPage()
    await userEvent.type(await screen.findByLabelText('Add issue #'), '10000')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Issue numbers are whole numbers from 1 to 9999.',
    )
    expect(writes).toHaveLength(0)
  })

  it('draws the wall and the add box for a series with nothing yet', async () => {
    stubApi({
      item: {
        ...COMIC,
        issues_owned: null,
        comic_run: { owned: 0, released: 0, missing: 0, read: 0 },
      },
      wall: {
        wall: { ...WALL.wall, issues: [] },
        comic: { ...WALL.comic, owned_text: '', released: 0 },
      },
    })
    renderPage()
    expect(await screen.findByLabelText('Add issue #')).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'Every book in the run' }),
    ).toBeNull()
  })

  it('has no axe violations', async () => {
    stubApi()
    const { container } = renderPage()
    await screen.findByRole('heading', { level: 1, name: COMIC.title })
    expect(await axeViolations(container)).toEqual([])
  })
})
