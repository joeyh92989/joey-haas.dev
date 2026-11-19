import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOAD_ERROR } from '../content/status.js'
import { axeViolations } from '../lib/axe.test-util.js'
import * as edits from '../lib/comicEdits.js'
import ComicVolume from './ComicVolume.jsx'

vi.mock('../lib/comicEdits.js', () => ({
  setMark: vi.fn(async () => ({})),
}))

const ID = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

// The body of GET /api/public/items/{id}/volumes/{slug}, keys as
// backend/public_issues.py PublicVolumePage declares them.
const PAGE = {
  title: {
    id: ID,
    title: 'Saga',
    cover_url: 'https://example.test/saga.jpg',
    publisher: 'Image',
    year: 2012,
  },
  volume: {
    slug: 'vol-2',
    label: 'Volume Two',
    kind: 'trade',
    line_number: 2,
    isbn: '9781607066019',
    pages: 144,
    description: ['First paragraph.', 'Second paragraph.'],
    cover_url: 'https://example.test/v2-small.jpg',
    large_url: 'https://example.test/v2.jpg',
    owned: true,
    read: false,
  },
  collects: [
    {
      series_name: 'Saga',
      issue_text: '#7-12',
      link: { item_id: ID, from_number: 7, to_number: 12 },
    },
    {
      series_name: 'Other Book',
      issue_text: '#1',
      link: { item_id: OTHER, from_number: 1, to_number: 1 },
    },
    { series_name: 'Saga', issue_text: 'Annual 1', link: null },
  ],
  prev: { slug: 'vol-1', label: 'Volume One', line_number: 1 },
  next: { slug: 'vol-3', label: 'Volume Three', line_number: 3 },
  source_url: 'https://comicvine.gamespot.com/saga/4000-1/',
}

function body(over = {}) {
  return {
    ...PAGE,
    ...over,
    title: { ...PAGE.title, ...over.title },
    volume: { ...PAGE.volume, ...over.volume },
  }
}

function stubApi({ page = {}, status = 200 } = {}) {
  const fetch = vi.fn(async () => ({
    ok: status === 200,
    status,
    json: async () => body(page),
  }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

function renderVolume({ signedIn = false } = {}) {
  return render(
    <MemoryRouter initialEntries={[`/shelf/${ID}/vol-2/`]}>
      <Routes>
        <Route element={<Outlet context={{ signedIn }} />}>
          <Route
            path="shelf/:id/:part"
            element={<ComicVolume id={ID} slug="vol-2" />}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('ComicVolume', () => {
  it('keeps a heading and the way back when the read fails, and Try again loads it', async () => {
    const answers = [
      { ok: false, status: 500 },
      { ok: true, status: 200 },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const next = answers.length > 1 ? answers.shift() : answers[0]
        return { ...next, json: async () => PAGE }
      }),
    )
    renderVolume()
    expect(await screen.findByRole('alert')).toHaveTextContent(LOAD_ERROR)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Book' }),
    ).toBeInTheDocument()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(
      within(crumbs).getByRole('link', { name: 'Series' }),
    ).toHaveAttribute('href', `/shelf/${ID}/`)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Volume Two' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('asks the public volume endpoint', async () => {
    const fetch = stubApi()
    renderVolume()
    await screen.findByRole('heading', { level: 1 })
    expect(fetch.mock.calls[0][0]).toBe(`/api/public/items/${ID}/volumes/vol-2`)
  })

  it('shows the label as the heading, the breadcrumb and the large cover', async () => {
    stubApi()
    renderVolume()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Volume Two' }),
    ).toBeInTheDocument()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Saga' })).toHaveAttribute(
      'href',
      `/shelf/${ID}/`,
    )
    expect(within(crumbs).getByText('Volume Two')).toBeInTheDocument()
    expect(screen.getByAltText('Cover of Saga, Volume Two')).toHaveAttribute(
      'src',
      'https://example.test/v2.jpg',
    )
  })

  it('shows format, number, pages and ISBN', async () => {
    stubApi()
    renderVolume()
    await screen.findByRole('heading', { level: 1 })
    const facts = document.querySelector('dl.comic-issue-facts')
    expect(facts).toHaveTextContent('FormatTrade paperback')
    expect(facts).toHaveTextContent('NumberVol. 2')
    expect(facts).toHaveTextContent('Pages144')
    expect(facts).toHaveTextContent('ISBN9781607066019')
  })

  it('leaves out the facts that are not there', async () => {
    stubApi({
      page: { volume: { line_number: null, isbn: null, pages: null } },
    })
    renderVolume()
    await screen.findByRole('heading', { level: 1 })
    const facts = document.querySelector('dl.comic-issue-facts')
    expect(facts).toHaveTextContent('Format')
    expect(facts).not.toHaveTextContent('Number')
    expect(facts).not.toHaveTextContent('Pages')
    expect(facts).not.toHaveTextContent('ISBN')
  })

  it.each([
    [false, 'Owned'],
    [true, 'Read'],
  ])('with read=%s shows the %s pill', async (read, word) => {
    stubApi({ page: { volume: { read } } })
    renderVolume()
    await screen.findByRole('heading', { level: 1 })
    expect(document.querySelector('.state-pill')).toHaveTextContent(word)
  })

  it('lists collects as written; linked ones go to the issue page', async () => {
    stubApi()
    renderVolume()
    const list = await screen.findByRole('list', { name: 'Collects' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Saga')
    const first = within(items[0]).getByRole('link', { name: /#7-12/ })
    expect(first).toHaveAttribute('href', `/shelf/${ID}/7/`)
    expect(within(items[1]).getByRole('link')).toHaveAttribute(
      'href',
      `/shelf/${OTHER}/1/`,
    )
    expect(items[2]).toHaveTextContent('Saga')
    expect(items[2]).toHaveTextContent('Annual 1')
    expect(within(items[2]).queryByRole('link')).toBeNull()
  })

  it('says so, with no empty list, when collects is empty', async () => {
    stubApi({ page: { collects: [] } })
    renderVolume()
    expect(
      await screen.findByText('What’s inside hasn’t been added yet.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Collects' })).toBeNull()
    expect(
      screen.getByRole('heading', { name: 'Collects' }),
    ).toBeInTheDocument()
  })

  it('links the previous and next book with label and number', async () => {
    stubApi()
    renderVolume()
    const nav = await screen.findByRole('navigation', {
      name: 'Neighboring books',
    })
    const prev = within(nav).getByRole('link', { name: /Volume One/ })
    expect(prev).toHaveAttribute('href', `/shelf/${ID}/vol-1/`)
    expect(prev).toHaveTextContent('Vol. 1')
    const next = within(nav).getByRole('link', { name: /Volume Three/ })
    expect(next).toHaveAttribute('href', `/shelf/${ID}/vol-3/`)
    expect(next).toHaveTextContent('Vol. 3')
  })

  it('at the ends, a plain line instead of a dead link', async () => {
    stubApi({ page: { prev: null, next: null } })
    renderVolume()
    const nav = await screen.findByRole('navigation', {
      name: 'Neighboring books',
    })
    expect(within(nav).queryAllByRole('link')).toHaveLength(0)
    expect(within(nav).getByText('This is the first book.')).toBeInTheDocument()
    expect(within(nav).getByText('This is the last book.')).toBeInTheDocument()
  })

  it('names a neighbour with no number by its label alone', async () => {
    stubApi({
      page: { next: { slug: 'vol-x', label: 'Loose', line_number: null } },
    })
    renderVolume()
    const link = await screen.findByRole('link', { name: /Loose/ })
    expect(link).not.toHaveTextContent('Vol.')
  })

  it('shows the no-description line and credits Comic Vine', async () => {
    stubApi({ page: { volume: { description: [] } } })
    renderVolume()
    expect(
      await screen.findByText('Comic Vine has no description for this issue.'),
    ).toBeInTheDocument()
    for (const link of screen.getAllByRole('link', { name: 'Comic Vine' }))
      expect(link).toHaveAttribute(
        'href',
        'https://comicvine.gamespot.com/saga/4000-1/',
      )
  })

  it('falls back to the Comic Vine home page when the title has no page', async () => {
    stubApi({ page: { source_url: null } })
    renderVolume()
    await screen.findByRole('heading', { level: 1 })
    for (const link of screen.getAllByRole('link', { name: 'Comic Vine' }))
      expect(link).toHaveAttribute('href', 'https://comicvine.gamespot.com/')
  })

  it('credits Metron with both links only when the page says so', async () => {
    stubApi({ page: { metron_credit: true } })
    renderVolume()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByRole('link', { name: /Metron/ })).toHaveAttribute(
      'href',
      'https://metron.cloud/',
    )
    expect(screen.getByRole('link', { name: 'CC BY-SA 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by-sa/4.0/',
    )
    expect(
      screen.getByText(/reformatted into issue ranges/),
    ).toBeInTheDocument()
  })

  it('has no Metron credit on a volume without Metron contents', async () => {
    stubApi()
    renderVolume()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByText(/Metron/)).not.toBeInTheDocument()
  })

  it('renders NotFound on a 404 and an error line on a failure', async () => {
    stubApi({ status: 404 })
    const { unmount } = renderVolume()
    expect(await screen.findByText(/not found|isn.t here/i)).toBeInTheDocument()
    unmount()
    stubApi({ status: 500 })
    renderVolume()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('hides the owner controls when signed out', async () => {
    stubApi()
    renderVolume()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByText('Only you see these buttons.')).toBeNull()
  })

  it('signed in: Read to the end marks the linked range on this title', async () => {
    const fetch = stubApi()
    const user = userEvent.setup()
    renderVolume({ signedIn: true })
    expect(await screen.findByText('Only you see these buttons.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Edit book' })).toHaveAttribute(
      'href',
      `/admin/shelf/comics/${ID}/vol-2`,
    )
    await user.click(screen.getByRole('button', { name: 'Read to the end' }))
    await waitFor(() =>
      expect(edits.setMark).toHaveBeenCalledWith(ID, 7, 'read', 12),
    )
    await waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThan(1))
  })

  it('signed in, with no linked range on this title: only the Edit link', async () => {
    stubApi({
      page: {
        collects: [
          {
            series_name: 'Other Book',
            issue_text: '#1',
            link: { item_id: OTHER, from_number: 1, to_number: 1 },
          },
          { series_name: 'Saga', issue_text: 'Annual 1', link: null },
        ],
      },
    })
    renderVolume({ signedIn: true })
    expect(
      await screen.findByRole('link', { name: 'Edit book' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Read to the end/ })).toBeNull()
  })

  it('disables Read to the end once the volume is read', async () => {
    stubApi({ page: { volume: { read: true } } })
    renderVolume({ signedIn: true })
    expect(
      await screen.findByRole('button', { name: 'Read to the end ✓' }),
    ).toBeDisabled()
  })

  it('shows the refusal when Read to the end fails', async () => {
    stubApi()
    edits.setMark.mockRejectedValueOnce(new Error('Read to is past the run'))
    const user = userEvent.setup()
    renderVolume({ signedIn: true })
    await user.click(
      await screen.findByRole('button', { name: 'Read to the end' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Read to is past the run',
    )
  })

  it('has no accessibility violations', async () => {
    stubApi()
    const { container } = renderVolume({ signedIn: true })
    await screen.findByRole('heading', { level: 1 })
    expect(await axeViolations(container)).toEqual([])
  })
})
