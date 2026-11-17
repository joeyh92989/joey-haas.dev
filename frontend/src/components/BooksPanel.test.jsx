import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import rows from '../../e2e/fixtures/api/admin-volumes.json'
import created from '../../e2e/fixtures/api/admin-volume.json'
import BooksPanel from './BooksPanel.jsx'

const ID = created.item_id

function stubApi({
  list = rows,
  createStatus = 201,
  createBody = created,
} = {}) {
  const writes = []
  const fetch = vi.fn(async (url, options = {}) => {
    const method = options.method ?? 'GET'
    if (method === 'GET')
      return { ok: true, status: 200, json: async () => list }
    writes.push([method, String(url), JSON.parse(options.body)])
    return {
      ok: createStatus === 201,
      status: createStatus,
      json: async () =>
        createStatus === 201
          ? { ...createBody, slug: 'vol-4' }
          : {
              detail: [
                {
                  loc: ['body', 'label'],
                  msg: 'String should have at least 1 character',
                  type: 'string_too_short',
                },
              ],
            },
    }
  })
  vi.stubGlobal('fetch', fetch)
  return { fetch, writes }
}

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={['/start']}>
      <Routes>
        <Route path="/start" element={<BooksPanel itemId={ID} />} />
        <Route
          path="/admin/shelf/comics/:id/:slug"
          element={<p>the new book page</p>}
        />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('BooksPanel', () => {
  it('lists each book with its cover slot, number, kind, marks and entries', async () => {
    stubApi()
    renderPanel()
    expect(await screen.findByRole('heading', { name: 'Books' })).toBeVisible()
    const items = within(
      screen.getByRole('list', { name: 'Books on this title' }),
    ).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    const [one, two, three] = items
    expect(
      within(one).getByRole('link', { name: 'Saga, Book One' }),
    ).toHaveAttribute('href', `/admin/shelf/comics/${ID}/vol-1`)
    expect(one).toHaveTextContent('Vol. 1')
    expect(one).toHaveTextContent('Hardcover')
    expect(one).toHaveTextContent('Read')
    expect(one).toHaveTextContent('2 entries')
    expect(two).toHaveTextContent('Owned')
    expect(two).not.toHaveTextContent('Read')
    expect(three).toHaveTextContent('Not owned')
    expect(three).toHaveTextContent('0 entries')
    expect(one.querySelector('img')).toHaveAttribute(
      'src',
      'https://example.test/1.jpg',
    )
  })

  it('says so when the title has no books', async () => {
    stubApi({ list: [] })
    renderPanel()
    expect(
      await screen.findByText(
        'No books on this title yet. Add the first one below.',
      ),
    ).toBeVisible()
    expect(
      screen.queryByRole('list', { name: 'Books on this title' }),
    ).toBeNull()
  })

  it('adds a book with a label, one of five kinds and a number, then opens its page', async () => {
    const { writes } = stubApi()
    const user = userEvent.setup()
    renderPanel()
    await screen.findByRole('heading', { name: 'Books' })
    const kind = screen.getByLabelText('Kind')
    expect(within(kind).getAllByRole('option')).toHaveLength(5)
    await user.type(screen.getByLabelText('Name'), ' Deluxe One ')
    await user.selectOptions(kind, 'omnibus')
    await user.type(screen.getByLabelText('Number in its line'), '4')
    await user.click(screen.getByRole('button', { name: 'Add book' }))
    expect(await screen.findByText('the new book page')).toBeVisible()
    expect(writes).toEqual([
      [
        'POST',
        `/api/comics/${ID}/volumes`,
        { label: ' Deluxe One ', kind: 'omnibus', line_number: 4 },
      ],
    ])
  })

  it('shows the API’s refusal beside the name and stays put', async () => {
    stubApi({ createStatus: 422 })
    const user = userEvent.setup()
    renderPanel()
    await screen.findByRole('heading', { name: 'Books' })
    await user.click(screen.getByRole('button', { name: 'Add book' }))
    expect(
      await screen.findByText('String should have at least 1 character'),
    ).toBeVisible()
    expect(screen.queryByText('the new book page')).toBeNull()
  })

  it('has no axe violations', async () => {
    stubApi()
    const { container } = renderPanel()
    await screen.findByRole('heading', { name: 'Books' })
    await waitFor(async () =>
      expect(await axeViolations(container)).toEqual([]),
    )
  })
})
