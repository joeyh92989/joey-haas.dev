import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOAD_ERROR } from '../content/status.js'
import { axeViolations } from '../lib/axe.test-util.js'
import * as edits from '../lib/comicEdits.js'
import ComicEdition from './ComicEdition.jsx'

vi.mock('../lib/comicEdits.js', () => ({
  setReadTo: vi.fn(async () => {}),
}))

const ID = '11111111-1111-1111-1111-111111111111'

const PAGE = {
  series_id: ID,
  series_title: 'Saga',
  publisher: 'Image',
  slug: 'ed-1-6',
  kind: 'Trade paperback',
  label: 'Volume One',
  from_issue: 1,
  to_issue: 6,
  cover_url: 'https://example.test/v1-small.jpg',
  large_url: 'https://example.test/v1.jpg',
  description: ['First paragraph.', 'Second paragraph.'],
  state: 'owned',
  read: 'not-yet',
  read_to: null,
  inside: [
    { number: 1, cover_url: null, state: 'owned' },
    { number: 2, cover_url: null, state: 'owned' },
  ],
  prev: null,
  next: { slug: 'ed-7-12', label: 'Volume Two' },
  source_url: 'https://comicvine.gamespot.com/saga/4000-1/',
}

function stubApi({ page = {}, status = 200 } = {}) {
  const fetch = vi.fn(async () => ({
    ok: status === 200,
    status,
    json: async () => ({ ...PAGE, ...page }),
  }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

function renderEdition({ signedIn = false } = {}) {
  return render(
    <MemoryRouter initialEntries={[`/shelf/${ID}/ed-1-6/`]}>
      <Routes>
        <Route element={<Outlet context={{ signedIn }} />}>
          <Route
            path="shelf/:id/:part"
            element={<ComicEdition id={ID} slug="ed-1-6" />}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('ComicEdition', () => {
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
    renderEdition()
    expect(await screen.findByRole('alert')).toHaveTextContent(LOAD_ERROR)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Collected edition' }),
    ).toBeInTheDocument()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(
      within(crumbs).getByRole('link', { name: 'Series' }),
    ).toHaveAttribute('href', `/shelf/${ID}/`)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: /Volume One/ }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('asks the public edition endpoint', async () => {
    const fetch = stubApi()
    renderEdition()
    await screen.findByRole('heading', { level: 1 })
    expect(fetch.mock.calls[0][0]).toBe(
      `/api/public/items/${ID}/editions/ed-1-6`,
    )
  })

  it('shows the kicker, title, breadcrumb and cover', async () => {
    stubApi()
    renderEdition()
    expect(
      await screen.findByText('Trade paperback · collects #1–6'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Saga, Volume One' }),
    ).toBeInTheDocument()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Saga' })).toHaveAttribute(
      'href',
      `/shelf/${ID}/`,
    )
    expect(screen.getByAltText('Cover of Saga, Volume One')).toHaveAttribute(
      'src',
      'https://example.test/v1.jpg',
    )
  })

  it.each([
    ['all', 6, 'All of it'],
    ['to', 4, 'To #4'],
    ['not-yet', null, 'Not yet'],
  ])('reads %s as "%s"', async (read, readTo, text) => {
    stubApi({ page: { read, read_to: readTo } })
    renderEdition()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('links each inside tile to its issue page', async () => {
    stubApi()
    renderEdition()
    const list = await screen.findByRole('list', { name: 'Inside this book' })
    const links = within(list).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      `/shelf/${ID}/1/`,
      `/shelf/${ID}/2/`,
    ])
  })

  it('links the next edition', async () => {
    stubApi()
    renderEdition()
    const link = await screen.findByRole('link', { name: /Volume Two/ })
    expect(link).toHaveAttribute('href', `/shelf/${ID}/ed-7-12/`)
  })

  it('after the last edition, next is the first issue after it', async () => {
    stubApi({
      page: {
        prev: { slug: 'ed-1-6', label: 'Volume One' },
        next: { number: 13 },
      },
    })
    renderEdition()
    const next = await screen.findByRole('link', { name: /#13/ })
    expect(next).toHaveAttribute('href', `/shelf/${ID}/13/`)
    expect(screen.getByRole('link', { name: /Volume One/ })).toHaveAttribute(
      'href',
      `/shelf/${ID}/ed-1-6/`,
    )
  })

  it('shows the no-description line and the first issue cover when unlinked', async () => {
    stubApi({
      page: {
        description: [],
        large_url: null,
        cover_url: 'https://example.test/first.jpg',
      },
    })
    renderEdition()
    expect(
      await screen.findByText('Comic Vine has no description for this issue.'),
    ).toBeInTheDocument()
    expect(screen.getByAltText('Cover of Saga, Volume One')).toHaveAttribute(
      'src',
      'https://example.test/first.jpg',
    )
  })

  it('credits Comic Vine', async () => {
    stubApi()
    renderEdition()
    const link = await screen.findByRole('link', { name: 'Comic Vine' })
    expect(link).toHaveAttribute(
      'href',
      'https://comicvine.gamespot.com/saga/4000-1/',
    )
  })

  it('renders NotFound on a 404 and an error line on a failure', async () => {
    stubApi({ status: 404 })
    const { unmount } = renderEdition()
    expect(await screen.findByText(/not found|isn.t here/i)).toBeInTheDocument()
    unmount()
    stubApi({ status: 500 })
    renderEdition()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('hides the owner controls when signed out', async () => {
    stubApi()
    renderEdition()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByText('Only you see these buttons.')).toBeNull()
  })

  it('signed in: Owned, Read to the end and Edit edition', async () => {
    const fetch = stubApi()
    const user = userEvent.setup()
    renderEdition({ signedIn: true })
    expect(await screen.findByText('Only you see these buttons.')).toBeVisible()
    expect(screen.getByText('Owned ✓')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit edition' })).toHaveAttribute(
      'href',
      `/admin/collection/${ID}`,
    )
    await user.click(screen.getByRole('button', { name: 'Read to the end' }))
    await waitFor(() => expect(edits.setReadTo).toHaveBeenCalledWith(ID, 6))
    await waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThan(1))
  })

  it('disables Read to the end once the whole book is read', async () => {
    stubApi({ page: { read: 'all', read_to: 6 } })
    renderEdition({ signedIn: true })
    expect(
      await screen.findByRole('button', { name: 'Read to the end ✓' }),
    ).toBeDisabled()
  })

  it('falls back to the Comic Vine home page when the series has no page', async () => {
    stubApi({ page: { source_url: null } })
    renderEdition()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByRole('link', { name: 'Comic Vine' })).toHaveAttribute(
      'href',
      'https://comicvine.gamespot.com/',
    )
  })

  it('shows the refusal when Read to the end fails', async () => {
    stubApi()
    edits.setReadTo.mockRejectedValueOnce(new Error('Read to is past the run'))
    const user = userEvent.setup()
    renderEdition({ signedIn: true })
    await user.click(
      await screen.findByRole('button', { name: 'Read to the end' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Read to is past the run',
    )
  })

  it('has no accessibility violations', async () => {
    stubApi()
    const { container } = renderEdition({ signedIn: true })
    await screen.findByRole('heading', { level: 1 })
    expect(await axeViolations(container)).toEqual([])
  })
})
