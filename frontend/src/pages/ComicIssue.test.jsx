import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { spine } from '../content/spine.js'
import { LOAD_ERROR } from '../content/status.js'
import { axeViolations } from '../lib/axe.test-util.js'
import * as edits from '../lib/comicEdits.js'
import ComicIssue from './ComicIssue.jsx'

vi.mock('../lib/comicEdits.js', () => ({
  toggleOwned: vi.fn(async () => {}),
  setReadTo: vi.fn(async () => {}),
  toggleSkip: vi.fn(async () => {}),
}))

const ID = '11111111-1111-1111-1111-111111111111'
const COPY = spine.comics.issue

const PAGE = {
  series_id: ID,
  series_title: 'Saga',
  publisher: 'Image',
  number: 58,
  name: 'The Will',
  store_date: '2026-03-04',
  cover_date: '2026-05-01',
  cover_url: 'https://example.test/58-small.jpg',
  large_url: 'https://example.test/58.jpg',
  description: ['First paragraph.'],
  state: 'owned',
  held_as: 'Single issue',
  edition: null,
  released: 72,
  ongoing: true,
  neighbours: [
    { number: 57, cover_url: null, state: 'read' },
    { number: 58, cover_url: null, state: 'owned' },
    { number: 59, cover_url: null, state: 'missing' },
    { number: 73, cover_url: null, state: 'not-out' },
  ],
  source_url: 'https://comicvine.gamespot.com/saga/4000-1/',
}

const STORED = {
  issues_owned: '1–58',
  issues_skipped: '60',
  read_to: 10,
}

/** Serves the public page and, for the owner, the stored row. */
function stubApi({ page = {}, status = 200, stored = STORED } = {}) {
  const fetch = vi.fn(async (url) => {
    if (String(url).includes('/api/public/items/')) {
      return {
        ok: status === 200,
        status,
        json: async () => ({ ...PAGE, ...page }),
      }
    }
    return { ok: true, status: 200, json: async () => stored }
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

function renderIssue({ signedIn = false, n = 58 } = {}) {
  return render(
    <MemoryRouter initialEntries={[`/shelf/${ID}/${n}/`]}>
      <Routes>
        <Route element={<Outlet context={{ signedIn }} />}>
          <Route
            path="shelf/:id/:part"
            element={<ComicIssue id={ID} n={n} />}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('ComicIssue, public', () => {
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
    renderIssue()
    expect(await screen.findByRole('alert')).toHaveTextContent(LOAD_ERROR)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Issue #58' }),
    ).toBeInTheDocument()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(
      within(crumbs).getByRole('link', { name: 'Comics' }),
    ).toHaveAttribute('href', '/shelf/comics')
    expect(
      within(crumbs).getByRole('link', { name: 'Series' }),
    ).toHaveAttribute('href', `/shelf/${ID}/`)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: /#58/ }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the breadcrumb, heading, name and cover', async () => {
    stubApi()
    renderIssue()
    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(
      within(crumbs).getByRole('link', { name: 'Comics' }),
    ).toHaveAttribute('href', '/shelf/comics')
    expect(within(crumbs).getByRole('link', { name: 'Saga' })).toHaveAttribute(
      'href',
      `/shelf/${ID}/`,
    )
    expect(within(crumbs).getByText('#58')).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      screen.getByRole('heading', { level: 1, name: '#58 · The Will' }),
    ).toBeInTheDocument()
    expect(screen.getByAltText('Cover of Saga #58')).toHaveAttribute(
      'src',
      'https://example.test/58.jpg',
    )
    expect(screen.getByText('Saga · Image')).toBeInTheDocument()
  })

  it('leaves the name out when Comic Vine has none', async () => {
    stubApi({ page: { name: null } })
    renderIssue()
    expect(
      await screen.findByRole('heading', { level: 1, name: '#58' }),
    ).toBeInTheDocument()
  })

  it('lists the Held as and Read facts', async () => {
    stubApi({ page: { held_as: 'In Volume Nine (trade paperback)' } })
    renderIssue()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText('#58 of 72+')).toBeInTheDocument()
    expect(screen.getByText('In Volume Nine (trade paperback)')).toBeVisible()
    expect(screen.getByText('Held as')).toBeInTheDocument()
    expect(screen.getByText('Not yet')).toBeInTheDocument()
  })

  it('links the edition pill to its page', async () => {
    stubApi({
      page: {
        edition: { slug: 'ed-55-60', label: 'Volume Nine', kind: 'trade' },
      },
    })
    renderIssue()
    const link = await screen.findByRole('link', { name: 'In Volume Nine →' })
    expect(link).toHaveAttribute('href', `/shelf/${ID}/ed-55-60/`)
  })

  it('shows the first paragraph and reveals the rest on More', async () => {
    stubApi({ page: { description: ['One.', 'Two.', 'Three.'] } })
    renderIssue()
    await screen.findByText('One.')
    expect(screen.getByText('Two.')).not.toBeVisible()
    const more = screen.getByRole('button', { name: 'More' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(more)
    expect(screen.getByText('Two.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('says so when there is no description', async () => {
    stubApi({ page: { description: [] } })
    renderIssue()
    expect(await screen.findByText(COPY.noDescription)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull()
  })

  it('links the attribution to source_url', async () => {
    stubApi()
    renderIssue()
    expect(
      await screen.findByRole('link', { name: 'Comic Vine' }),
    ).toHaveAttribute('href', PAGE.source_url)
  })

  it('draws the neighbour strip with this issue marked', async () => {
    stubApi()
    renderIssue()
    const strip = await screen.findByRole('list', {
      name: 'Neighbouring issues',
    })
    expect(
      within(strip).getByRole('link', { name: 'Saga #58, Owned' }),
    ).toHaveAttribute('aria-current', 'page')
    expect(within(strip).queryByRole('link', { name: /#73/ })).toBeNull()
  })

  it('shows no owner box and no skip text signed out', async () => {
    const fetch = stubApi()
    const { container } = renderIssue()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByText(COPY.owner.note)).toBeNull()
    expect(container.textContent).not.toMatch(/skip/i)
    // The owner's row is never even asked for.
    expect(
      fetch.mock.calls.some(([url]) => !String(url).includes('/public/')),
    ).toBe(false)
  })

  it('renders NotFound on a 404', async () => {
    stubApi({ status: 404 })
    renderIssue()
    expect(
      await screen.findByRole('heading', { name: 'Not found' }),
    ).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    stubApi()
    const { container } = renderIssue()
    await screen.findByRole('heading', { level: 1 })
    expect(await axeViolations(container)).toEqual([])
  })
})

describe('ComicIssue, signed in', () => {
  it('shows the owner box and I own this calls toggleOwned', async () => {
    stubApi({
      page: { state: 'missing', held_as: 'Not owned' },
      stored: { ...STORED, issues_owned: '1–10' },
    })
    renderIssue({ signedIn: true })
    expect(await screen.findByText(COPY.owner.note)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'I own this' }))
    expect(edits.toggleOwned).toHaveBeenCalledWith(ID, 58)
  })

  it('reloads the public page after an action', async () => {
    const fetch = stubApi({
      page: { state: 'missing' },
      stored: { ...STORED, issues_owned: '' },
    })
    renderIssue({ signedIn: true })
    await userEvent.click(
      await screen.findByRole('button', { name: 'I own this' }),
    )
    await waitFor(() =>
      expect(
        fetch.mock.calls.filter(([url]) => String(url).includes('/public/')),
      ).toHaveLength(2),
    )
  })

  it('offers Skip only when the issue is not held', async () => {
    stubApi({
      page: { state: 'missing' },
      stored: { ...STORED, issues_owned: '1–10' },
    })
    const { unmount } = renderIssue({ signedIn: true })
    await userEvent.click(
      await screen.findByRole('button', { name: COPY.owner.skip }),
    )
    expect(edits.toggleSkip).toHaveBeenCalledWith(ID, 58)
    unmount()

    stubApi({ page: { state: 'owned' } })
    renderIssue({ signedIn: true })
    await screen.findByText(COPY.owner.note)
    expect(screen.queryByRole('button', { name: COPY.owner.skip })).toBeNull()
  })

  it('reads I own this for an issue held only through an edition', async () => {
    stubApi({
      page: {
        state: 'owned',
        edition: { slug: 'ed-55-60', label: 'Volume Nine', kind: 'trade' },
      },
      stored: { ...STORED, issues_owned: '1–10' },
    })
    renderIssue({ signedIn: true })
    expect(
      await screen.findByRole('button', { name: 'I own this' }),
    ).toBeInTheDocument()
  })

  it('reads Owned ✓ for a single and sets read_to on Read to here', async () => {
    stubApi()
    renderIssue({ signedIn: true })
    expect(
      await screen.findByRole('button', { name: COPY.owner.owned }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Read to here' }))
    expect(edits.setReadTo).toHaveBeenCalledWith(ID, 58)
  })

  it('shows a refusal in the API’s words', async () => {
    stubApi({
      page: { state: 'missing' },
      stored: { ...STORED, issues_owned: '' },
    })
    vi.mocked(edits.toggleOwned).mockRejectedValueOnce(
      new Error('Issues owned: no more than 9999'),
    )
    renderIssue({ signedIn: true })
    await userEvent.click(
      await screen.findByRole('button', { name: 'I own this' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Issues owned: no more than 9999',
    )
  })

  it('shows the private skip pill to the owner when the issue is skipped', async () => {
    stubApi({
      page: { state: 'missing' },
      stored: { ...STORED, issues_owned: '1–10', issues_skipped: '58' },
    })
    renderIssue({ signedIn: true })
    await screen.findByText(COPY.owner.note)
    const pills = screen.getAllByText(spine.comics.wall.states.skipped)
    expect(pills.length).toBeGreaterThan(0)
    expect(
      screen.getByRole('button', { name: COPY.owner.skipped }),
    ).toBeInTheDocument()
  })
})
