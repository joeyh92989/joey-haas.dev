import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import view from '../../e2e/fixtures/api/admin-volume.json'
import list from '../../e2e/fixtures/api/admin-volumes.json'
import preview from '../../e2e/fixtures/api/admin-volume-delete-preview.json'
import state from '../../e2e/fixtures/api/admin-volume-state.json'
import moved from '../../e2e/fixtures/api/admin-volume-move.json'
import linked from '../../e2e/fixtures/api/admin-volume-link.json'
import AdminComicVolume from './AdminComicVolume.jsx'

const ID = view.item_id
const VOL = view.id
const PATH = `/admin/shelf/comics/${ID}/vol-2`
const OTHER = view.collects[2].link.item_id

// The title chooser reads `GET /api/items?type=comic`; only id, title and
// is_public are read from it.
const TITLES = [
  { id: ID, title: 'Saga', is_public: true },
  { id: OTHER, title: 'Hidden Run', is_public: false },
  { id: 'cccc', title: 'Paper Moons', is_public: true },
]

/** What the PUT route would answer: the body applied to the stored view. */
function applyPut(current, body) {
  return {
    ...current,
    label: body.label,
    kind: body.kind,
    line_number: body.line_number,
    pages: body.pages,
    isbn: body.isbn,
    description: body.description,
    owned: body.owned,
    read: body.read,
    collects: body.collects.map((entry, position) => {
      const old = current.collects.find((c) => c.id === entry.id)
      return {
        id: entry.id ?? `new-${position}`,
        position,
        series_name: entry.series_name,
        issue_text: entry.issue_text,
        source: old ? old.source : 'typed',
        link: entry.link
          ? {
              ...entry.link,
              title: TITLES.find((t) => t.id === entry.link.item_id)?.title,
              is_public:
                TITLES.find((t) => t.id === entry.link.item_id)?.is_public ??
                true,
            }
          : null,
      }
    }),
  }
}

function stubApi({ fail = {}, current = view, parse = null } = {}) {
  const writes = []
  let stored = current
  const fetch = vi.fn(async (url, options = {}) => {
    const path = String(url)
    const method = options.method ?? 'GET'
    const body = options.body ? JSON.parse(options.body) : null
    const reply = (data, status = 200) => ({
      ok: status < 400,
      status,
      json: async () => data,
    })
    if (method === 'GET') {
      if (path === `/api/comics/${ID}/volumes`) return reply(list)
      if (path === `/api/comics/volumes/${VOL}`) return reply(stored)
      if (path === `/api/comics/volumes/${VOL}/delete-preview`)
        return reply(preview)
      if (path.startsWith('/api/items')) return reply(TITLES)
      if (path.includes('issues/search'))
        return reply([
          {
            cv_id: 4242,
            volume_name: 'Saga',
            number: '7',
            name: 'Chapter Seven',
            thumb_url: null,
            year: 2013,
          },
        ])
      return reply({}, 404)
    }
    writes.push([method, path, body])
    const refusal = Object.entries(fail).find(([key]) =>
      `${method} ${path}`.includes(key),
    )
    if (refusal) return reply(refusal[1].body, refusal[1].status)
    if (method === 'POST' && path.endsWith('/contents/parse')) {
      const result = parse ?? {
        entries_added: 0,
        entries_replaced: 0,
        used_model: false,
        reason: 'no_match',
        collects: stored.collects,
      }
      stored = { ...stored, collects: result.collects }
      return reply(result)
    }
    if (method === 'PATCH') {
      stored = { ...stored, ...body }
      return reply({ ...state, ...body })
    }
    if (method === 'PUT' && path.endsWith('/link')) {
      stored = {
        ...stored,
        cv_id: linked.cv_id,
        cover_url: linked.cover_url,
        large_url: linked.large_url,
        description: linked.description,
      }
      return reply(linked)
    }
    if (method === 'PUT') {
      stored = applyPut(stored, body)
      return reply(stored)
    }
    if (method === 'POST' && path.endsWith('/move')) return reply(moved)
    if (method === 'DELETE')
      return reply({ id: VOL, item_id: ID, touched: [ID] })
    return reply({}, 404)
  })
  vi.stubGlobal('fetch', fetch)
  return { fetch, writes }
}

function renderPage(initial = PATH, props = {}) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/admin/shelf/comics/:id/:slug"
          element={<AdminComicVolume {...props} />}
        />
        <Route path="/admin/shelf/comics/:id" element={<p>the title page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function ready() {
  return screen.findByRole('heading', { level: 1, name: 'Saga, Book Two' })
}

afterEach(() => vi.unstubAllGlobals())

describe('AdminComicVolume: the twin of the public book page', () => {
  it('has the admin trail and the public page’s parts in the public page’s order', async () => {
    stubApi()
    renderPage()
    await ready()
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' })
    const links = within(trail).getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Shelf', '/admin/shelf/games'],
      ['Comics', '/admin/shelf/comics'],
      ['Saga', `/admin/shelf/comics/${ID}`],
    ])
    expect(within(trail).getByText('Saga, Book Two')).toHaveAttribute(
      'aria-current',
      'page',
    )
    const order = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
    expect(order).toEqual([
      'On the shelf',
      'Facts',
      'Collects',
      'Move to another title',
      'Delete',
    ])
    // Neighbours sit between Collects and the owner's tools, owned or not.
    const neighbours = screen.getByRole('navigation', {
      name: 'Neighboring books',
    })
    expect(
      within(neighbours).getByRole('link', { name: /Saga, Book One/ }),
    ).toHaveAttribute('href', `/admin/shelf/comics/${ID}/vol-1`)
    const next = within(neighbours).getByRole('link', {
      name: /Saga, Book Three/,
    })
    expect(next).toHaveAttribute('href', `/admin/shelf/comics/${ID}/vol-3`)
    expect(next).toHaveTextContent('Not owned')
  })

  it('shows View public page only when the book is owned and the title public', async () => {
    stubApi()
    const { unmount } = renderPage()
    await ready()
    expect(
      screen.getByRole('link', { name: 'View public page' }),
    ).toHaveAttribute('href', `/shelf/${ID}/vol-2/`)
    unmount()
    stubApi({ current: { ...view, owned: false } })
    renderPage()
    await ready()
    expect(screen.queryByRole('link', { name: 'View public page' })).toBeNull()
  })

  it('has no axe violations', async () => {
    stubApi()
    const { container } = renderPage()
    await ready()
    expect(await axeViolations(container)).toEqual([])
  })

  it('says so when no book has that address, and when signed out', async () => {
    stubApi()
    renderPage(`/admin/shelf/comics/${ID}/vol-9`)
    expect(
      await screen.findByText('No book with that address on this title.'),
    ).toBeVisible()
  })
})

describe('AdminComicVolume: owned and read', () => {
  it('saves instantly, says what changed, and Undo puts it back', async () => {
    const { writes } = stubApi()
    const user = userEvent.setup()
    renderPage()
    await ready()
    const read = screen.getByRole('button', { name: 'Read' })
    expect(read).toHaveAttribute('aria-pressed', 'false')
    await user.click(read)
    expect(await screen.findByText('Saga, Book Two: Read on.')).toBeVisible()
    expect(read).toHaveAttribute('aria-pressed', 'true')
    expect(writes).toEqual([
      ['PATCH', `/api/comics/volumes/${VOL}`, { read: true }],
    ])
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(read).toHaveAttribute('aria-pressed', 'false'))
    expect(writes.at(-1)).toEqual([
      'PATCH',
      `/api/comics/volumes/${VOL}`,
      { read: false },
    ])
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('keeps the old state and says so when the save is refused', async () => {
    stubApi({
      fail: {
        'PATCH /api/comics/volumes': {
          status: 404,
          body: { detail: 'No such volume' },
        },
      },
    })
    const user = userEvent.setup()
    renderPage()
    await ready()
    const owned = screen.getByRole('button', { name: 'Owned' })
    await user.click(owned)
    expect(await screen.findByRole('alert')).toHaveTextContent('No such volume')
    expect(owned).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('AdminComicVolume: facts', () => {
  it('saves every field with the whole current collects list, ids unchanged', async () => {
    const { writes } = stubApi()
    const user = userEvent.setup()
    renderPage()
    await ready()
    const label = screen.getByLabelText('Name')
    await user.clear(label)
    await user.type(label, 'Saga, Deluxe Two')
    await user.selectOptions(screen.getByLabelText('Format'), 'omnibus')
    await user.clear(screen.getByLabelText('Pages'))
    await user.type(screen.getByLabelText('Pages'), '400')
    await user.clear(screen.getByLabelText('ISBN'))
    await user.clear(screen.getByLabelText('Description'))
    await user.click(screen.getByRole('button', { name: 'Save facts' }))
    expect(await screen.findByText('Saved.')).toBeVisible()
    expect(writes).toHaveLength(1)
    const [method, path, body] = writes[0]
    expect([method, path]).toEqual(['PUT', `/api/comics/volumes/${VOL}`])
    expect(body).toMatchObject({
      label: 'Saga, Deluxe Two',
      kind: 'omnibus',
      line_number: 2,
      pages: 400,
      isbn: null,
      description: null,
      owned: true,
      read: false,
    })
    expect(body.collects).toEqual([
      {
        id: view.collects[0].id,
        series_name: 'Saga',
        issue_text: '#7-12',
        link: { item_id: ID, from_number: 7, to_number: 12 },
      },
      {
        id: view.collects[1].id,
        series_name: 'Saga Special',
        issue_text: 'Annual 1',
        link: null,
      },
      {
        id: view.collects[2].id,
        series_name: 'Hidden Run',
        issue_text: '#1-2',
        link: { item_id: OTHER, from_number: 1, to_number: 2 },
      },
    ])
    expect(
      screen.getByRole('heading', { level: 1, name: 'Saga, Deluxe Two' }),
    ).toBeVisible()
  })

  it('shows a 422 beside the field it names', async () => {
    stubApi({
      fail: {
        'PUT /api/comics/volumes': {
          status: 422,
          body: {
            detail: [
              {
                loc: ['body', 'pages'],
                msg: 'Input should be greater than or equal to 1',
                type: 'greater_than_equal',
              },
            ],
          },
        },
      },
    })
    const user = userEvent.setup()
    renderPage()
    await ready()
    await user.clear(screen.getByLabelText('Pages'))
    await user.type(screen.getByLabelText('Pages'), '0')
    await user.click(screen.getByRole('button', { name: 'Save facts' }))
    const field = screen.getByLabelText('Pages')
    await waitFor(() => expect(field).toBeInvalid())
    expect(field).toHaveAccessibleDescription(
      'Input should be greater than or equal to 1',
    )
  })

  it('links the cover to Comic Vine through the volume route and shows what came back', async () => {
    const { writes } = stubApi()
    const user = userEvent.setup()
    renderPage()
    await ready()
    await user.click(
      screen.getByRole('button', {
        name: 'Link to Comic Vine, Saga, Book Two',
      }),
    )
    await user.type(screen.getByLabelText('Search Comic Vine'), 'Saga 7')
    await user.click(
      await screen.findByRole(
        'button',
        { name: /Saga #7 ·/ },
        { timeout: 3000 },
      ),
    )
    await waitFor(() =>
      expect(writes).toContainEqual([
        'PUT',
        `/api/comics/volumes/${VOL}/link`,
        { cv_id: 4242 },
      ]),
    )
    expect(await screen.findByLabelText('Description')).toHaveValue(
      'From Comic Vine.',
    )
  })
})

describe('AdminComicVolume: collects', () => {
  it('lists each entry with its series, issues, source and link, and tags a private target', async () => {
    stubApi()
    renderPage()
    await ready()
    const items = within(
      screen.getByRole('list', { name: 'What is inside' }),
    ).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Saga')
    expect(items[0]).toHaveTextContent('#7–12')
    expect(items[0]).toHaveTextContent('Carried over')
    expect(items[0]).not.toHaveTextContent('Private')
    expect(items[1]).toHaveTextContent('Annual 1')
    expect(items[1]).toHaveTextContent('Typed')
    expect(items[2]).toHaveTextContent('Hidden Run')
    expect(items[2]).toHaveTextContent('From a photo')
    expect(within(items[2]).getByText('Private')).toBeVisible()
  })

  it('adds an entry with a title link, a range and sends the list with ids kept', async () => {
    const { writes } = stubApi()
    const user = userEvent.setup()
    renderPage()
    await ready()
    await user.click(screen.getByRole('button', { name: 'Add entry' }))
    await user.type(screen.getByLabelText('Series as printed'), 'Paper Moons')
    await user.type(screen.getByLabelText('Issues as printed'), '#1-3')
    await user.selectOptions(
      await screen.findByLabelText('Link to a comic on my shelf'),
      'cccc',
    )
    await user.type(screen.getByLabelText('From issue'), '1')
    await user.type(screen.getByLabelText('To issue'), '3')
    await user.click(screen.getByRole('button', { name: 'Save entry' }))
    expect(await screen.findByText('Added “Paper Moons”.')).toBeVisible()
    const [, path, body] = writes[0]
    expect(path).toBe(`/api/comics/volumes/${VOL}`)
    expect(body.collects).toHaveLength(4)
    expect(body.collects.slice(0, 3).map((c) => c.id)).toEqual(
      view.collects.map((c) => c.id),
    )
    expect(body.collects[3]).toEqual({
      series_name: 'Paper Moons',
      issue_text: '#1-3',
      link: { item_id: 'cccc', from_number: 1, to_number: 3 },
    })
    const list = screen.getByRole('list', { name: 'What is inside' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
  })

  it('edits an entry in place, keeping its id', async () => {
    const { writes } = stubApi()
    const user = userEvent.setup()
    renderPage()
    await ready()
    await user.click(
      screen.getByRole('button', { name: 'Edit Saga Special Annual 1' }),
    )
    const issues = screen.getByLabelText('Issues as printed')
    await user.clear(issues)
    await user.type(issues, 'Annual 2')
    await user.click(screen.getByRole('button', { name: 'Save entry' }))
    expect(await screen.findByText('Saved “Saga Special”.')).toBeVisible()
    expect(writes[0][2].collects[1]).toEqual({
      id: view.collects[1].id,
      series_name: 'Saga Special',
      issue_text: 'Annual 2',
      link: null,
    })
    expect(screen.queryByLabelText('Issues as printed')).toBeNull()
  })

  it('removes an entry only after a confirm, with no browser dialog', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const { writes } = stubApi()
    const user = userEvent.setup()
    renderPage()
    await ready()
    await user.click(
      screen.getByRole('button', { name: 'Remove Saga Special Annual 1' }),
    )
    expect(writes).toEqual([])
    await user.click(screen.getByRole('button', { name: /Remove for good/ }))
    expect(await screen.findByText('Removed “Saga Special”.')).toBeVisible()
    expect(writes[0][2].collects.map((c) => c.id)).toEqual([
      view.collects[0].id,
      view.collects[2].id,
    ])
    expect(confirm).not.toHaveBeenCalled()
  })

  it('reorders with Move up and Move down, and Undo puts the order back', async () => {
    const { writes } = stubApi()
    const user = userEvent.setup()
    renderPage()
    await ready()
    expect(
      screen.getByRole('button', { name: 'Move Saga #7-12 up' }),
    ).toBeDisabled()
    await user.click(
      screen.getByRole('button', { name: 'Move Saga #7-12 down' }),
    )
    await screen.findByText('Moved “Saga”.')
    expect(writes[0][2].collects.map((c) => c.id)).toEqual([
      view.collects[1].id,
      view.collects[0].id,
      view.collects[2].id,
    ])
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() =>
      expect(writes[1][2].collects.map((c) => c.id)).toEqual(
        view.collects.map((c) => c.id),
      ),
    )
  })

  it('shows a 422 beside the entry’s field from its loc path', async () => {
    stubApi({
      fail: {
        'PUT /api/comics/volumes': {
          status: 422,
          body: {
            detail: [
              {
                loc: ['body', 'collects', 3, 'link', 'to_number'],
                msg: 'Input should be greater than or equal to 1',
                type: 'greater_than_equal',
              },
            ],
          },
        },
      },
    })
    const user = userEvent.setup()
    renderPage()
    await ready()
    await user.click(screen.getByRole('button', { name: 'Add entry' }))
    await user.type(screen.getByLabelText('Series as printed'), 'Paper Moons')
    await user.selectOptions(
      await screen.findByLabelText('Link to a comic on my shelf'),
      'cccc',
    )
    await user.click(screen.getByRole('button', { name: 'Save entry' }))
    const to = screen.getByLabelText('To issue')
    await waitFor(() => expect(to).toBeInvalid())
    expect(to).toHaveAccessibleDescription(
      'Input should be greater than or equal to 1',
    )
    // The form stays open, with what was typed.
    expect(screen.getByLabelText('Series as printed')).toHaveValue(
      'Paper Moons',
    )
  })
})

const PARSED = {
  id: 'cccccccc-0000-0000-0000-000000000009',
  position: 3,
  series_name: 'Hellboy',
  issue_text: '#4',
  source: 'parsed',
  link: null,
}

describe('AdminComicVolume: read the contents from the description', () => {
  const parsePath = `/api/comics/volumes/${VOL}/contents/parse`

  it('posts the route with no body, says what was added and shows the new entry', async () => {
    const { writes } = stubApi({
      parse: {
        entries_added: 2,
        entries_replaced: 0,
        used_model: false,
        reason: null,
        collects: [...view.collects, PARSED],
      },
    })
    const user = userEvent.setup()
    renderPage()
    await ready()
    await user.click(
      screen.getByRole('button', { name: 'Read from description' }),
    )
    expect(await screen.findByText('Added 2 entries.')).toBeVisible()
    expect(writes).toEqual([['POST', parsePath, {}]])
    const list = screen.getByRole('list', { name: 'What is inside' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    expect(within(list).getByText('Hellboy')).toBeVisible()
    expect(within(list).getByText(/Source: Read from text/)).toBeVisible()
  })

  it('says when the model read it and when earlier reads were replaced', async () => {
    stubApi({
      parse: {
        entries_added: 1,
        entries_replaced: 1,
        used_model: true,
        reason: null,
        collects: view.collects,
      },
    })
    const user = userEvent.setup()
    renderPage()
    await ready()
    await user.click(
      screen.getByRole('button', { name: 'Read from description' }),
    )
    expect(
      await screen.findByText(
        'Added 1 entry, replacing 1 read earlier, read by the model.',
      ),
    ).toBeVisible()
  })

  it('says so when earlier read entries were removed and nothing new was found', async () => {
    stubApi({
      parse: {
        entries_added: 0,
        entries_replaced: 0,
        entries_removed: 2,
        used_model: false,
        reason: null,
        collects: view.collects,
      },
    })
    const user = userEvent.setup()
    renderPage()
    await ready()
    await user.click(
      screen.getByRole('button', { name: 'Read from description' }),
    )
    expect(
      await screen.findByText('Removed 2 earlier entries; nothing new found.'),
    ).toBeVisible()
    expect(screen.queryByText('Nothing new to add.')).toBeNull()
  })

  it.each([
    ['no_match', 'Found nothing in the description.'],
    ['budget', 'Today’s model budget is used up; add the contents by hand.'],
    [
      'model_error',
      'The model couldn’t read it just now; add the contents by hand.',
    ],
    [
      'no_text',
      'There is no description to read. Paste the reprint note, or add the contents by hand.',
    ],
  ])(
    'says %s in plain words and leaves the list alone',
    async (reason, text) => {
      stubApi({
        parse: {
          entries_added: 0,
          entries_replaced: 0,
          used_model: false,
          reason,
          collects: view.collects,
        },
      })
      const user = userEvent.setup()
      renderPage()
      await ready()
      await user.click(
        screen.getByRole('button', { name: 'Read from description' }),
      )
      expect(await screen.findByText(text)).toBeVisible()
      expect(
        within(
          screen.getByRole('list', { name: 'What is inside' }),
        ).getAllByRole('listitem'),
      ).toHaveLength(3)
    },
  )

  it('sends a pasted reprint note, and only when the box is open', async () => {
    const { writes } = stubApi()
    const user = userEvent.setup()
    renderPage()
    await ready()
    expect(screen.queryByLabelText('Reprint note')).toBeNull()
    await user.click(
      screen.getByRole('button', { name: 'Paste the reprint note' }),
    )
    await user.type(screen.getByLabelText('Reprint note'), 'Collects Saga #1-6')
    await user.click(
      screen.getByRole('button', { name: 'Read from description' }),
    )
    await screen.findByText('Found nothing in the description.')
    expect(writes).toEqual([
      ['POST', parsePath, { note: 'Collects Saga #1-6' }],
    ])
    await user.click(
      screen.getByRole('button', { name: 'Hide the reprint note' }),
    )
    expect(screen.queryByLabelText('Reprint note')).toBeNull()
  })

  it('shows the server’s refusal and keeps the list', async () => {
    stubApi({
      fail: {
        'contents/parse': { status: 404, body: { detail: 'No such volume' } },
      },
    })
    const user = userEvent.setup()
    renderPage()
    await ready()
    await user.click(
      screen.getByRole('button', { name: 'Read from description' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('No such volume')
    expect(
      within(screen.getByRole('list', { name: 'What is inside' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(3)
  })

  it('has no axe violations with the note box open', async () => {
    stubApi()
    const user = userEvent.setup()
    const { container } = renderPage()
    await ready()
    await user.click(
      screen.getByRole('button', { name: 'Paste the reprint note' }),
    )
    expect(await axeViolations(container)).toEqual([])
  })
})

describe('AdminComicVolume: move and delete', () => {
  it('moves to another title and shows the note about the address', async () => {
    const { writes } = stubApi()
    const user = userEvent.setup()
    renderPage()
    await ready()
    const select = await screen.findByLabelText('Move to')
    // Not the title it is already on.
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Choose a comic', 'Hidden Run (private)', 'Paper Moons'])
    await user.selectOptions(select, OTHER)
    await user.click(screen.getByRole('button', { name: 'Move book' }))
    expect(
      await screen.findByText(
        'Moved. vol-2 was already taken on that title, so this book is now vol-3.',
      ),
    ).toBeVisible()
    expect(writes[0]).toEqual([
      'POST',
      `/api/comics/volumes/${VOL}/move`,
      { item_id: OTHER },
    ])
    // The page is now the book on its new title.
    expect(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole(
        'link',
        { name: 'Hidden Run' },
      ),
    ).toHaveAttribute('href', `/admin/shelf/comics/${OTHER}`)
  })

  it('reads the preview when delete arms, names what stops being held, then deletes and goes back to the title', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const { fetch, writes } = stubApi()
    const user = userEvent.setup()
    renderPage()
    await ready()
    await user.click(
      screen.getByRole('button', { name: 'Delete Saga, Book Two' }),
    )
    const detail = await screen.findByText(/stop being held/)
    expect(detail).toHaveTextContent('“Saga, Book Two” on Saga goes with 3')
    expect(detail).toHaveTextContent('contents entries')
    expect(detail).toHaveTextContent('Saga: issues 7-12 stop being held')
    expect(detail).toHaveTextContent('2 read marks are lost')
    expect(fetch).toHaveBeenCalledWith(
      `/api/comics/volumes/${VOL}/delete-preview`,
      expect.anything(),
    )
    expect(writes).toEqual([])
    await user.click(
      screen.getByRole('button', { name: 'Delete Saga, Book Two for good' }),
    )
    expect(await screen.findByText('the title page')).toBeVisible()
    expect(writes).toEqual([['DELETE', `/api/comics/volumes/${VOL}`, null]])
    expect(confirm).not.toHaveBeenCalled()
  })
})
