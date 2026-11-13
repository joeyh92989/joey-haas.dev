import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { spine } from '../content/spine.js'
import { LOAD_ERROR, SAVED_NOT_REFRESHED } from '../content/status.js'
import { axeViolations } from '../lib/axe.test-util.js'
import * as edits from '../lib/comicEdits.js'
import ComicIssue from './ComicIssue.jsx'

vi.mock('../lib/comicEdits.js', () => ({
  setMark: vi.fn(async () => ({})),
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

  it('dims the Comic Vine cover of an unowned issue and says Not owned', async () => {
    stubApi({ page: { state: 'missing', held_as: 'Not owned' } })
    renderIssue()
    const img = await screen.findByAltText('Cover of Saga #58')
    expect(img.closest('.cover')).toHaveAttribute('data-unowned')
    expect(
      document.querySelector('.comic-issue-cover-caption'),
    ).toHaveTextContent(COPY.notOwned)
  })

  it('shows a labelled placeholder for an unowned issue with no cover', async () => {
    stubApi({
      page: {
        state: 'missing',
        held_as: 'Not owned',
        cover_url: null,
        large_url: null,
      },
    })
    renderIssue()
    await screen.findByRole('heading', { level: 1 })
    const holder = document.querySelector('.comic-issue-cover .cover-nocover')
    expect(holder).toHaveTextContent('#58')
    expect(holder).toHaveTextContent(COPY.noCover)
    expect(document.querySelector('.comic-issue-cover img')).toBeNull()
    expect(
      document.querySelector('.comic-issue-cover-caption'),
    ).toHaveTextContent(COPY.notOwned)
  })

  it('does not dim or caption an owned issue', async () => {
    stubApi()
    renderIssue()
    const img = await screen.findByAltText('Cover of Saga #58')
    expect(img.closest('.cover')).not.toHaveAttribute('data-unowned')
    expect(document.querySelector('.comic-issue-cover-caption')).toBeNull()
  })

  it('shows the breadcrumb, heading, name and cover', async () => {
    stubApi()
    renderIssue()
    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(
      within(crumbs).getByRole('link', { name: 'My Shelf' }),
    ).toHaveAttribute('href', '/shelf')
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
      screen.getByRole('heading', { level: 1, name: 'Saga #58 · The Will' }),
    ).toBeInTheDocument()
    expect(screen.getByAltText('Cover of Saga #58')).toHaveAttribute(
      'src',
      'https://example.test/58.jpg',
    )
    // The series is in the trail and the title, so the kicker is the publisher.
    expect(screen.getByText('Image')).toHaveClass('item-kicker')
  })

  it('does not dim an upcoming issue or call it not owned', async () => {
    stubApi({ page: { state: 'not-out', held_as: 'Not out yet' } })
    renderIssue()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByText(COPY.notOwned)).toBeNull()
    expect(document.querySelector('.cover[data-unowned]')).toBeNull()
    expect(screen.getAllByText('Not out yet').length).toBeGreaterThan(0)
  })

  it('leaves the name out when Comic Vine has none', async () => {
    stubApi({ page: { name: null } })
    renderIssue()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Saga #58' }),
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
    await screen.findByRole('heading', { level: 1 })
    // The source line under the description and the page's own credit.
    const links = screen.getAllByRole('link', { name: 'Comic Vine' })
    expect(links).toHaveLength(2)
    for (const link of links) expect(link).toHaveAttribute('href', PAGE.source_url)
    expect(screen.getByText('From')).toBeVisible()
  })

  it('credits the cover when Comic Vine has no description for it', async () => {
    stubApi({ page: { description: [] } })
    renderIssue()
    expect(await screen.findByText('Cover from')).toBeVisible()
  })

  it('has no source line for a missing description and no cover', async () => {
    stubApi({ page: { description: [], cover_url: null, large_url: null } })
    renderIssue()
    await screen.findByText(COPY.noDescription)
    expect(screen.queryByText('Cover from')).toBeNull()
  })

  it('draws the neighbour strip with this issue marked', async () => {
    stubApi()
    renderIssue()
    const strip = await screen.findByRole('list', {
      name: 'Neighboring issues',
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
  it('shows the owner box and I own this marks the book owned', async () => {
    stubApi({
      page: { state: 'missing', held_as: 'Not owned' },
      stored: { ...STORED, issues_owned: '1–10' },
    })
    renderIssue({ signedIn: true })
    expect(await screen.findByText(COPY.owner.note)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'I own this' }))
    expect(edits.setMark).toHaveBeenCalledWith(ID, 58, 'owned')
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

  it('holds an edition-only book owned, says why, and still reads it', async () => {
    stubApi({
      page: {
        state: 'owned',
        edition: { slug: 'ed-55-60', label: 'Volume Nine', kind: 'trade' },
      },
      stored: { ...STORED, issues_owned: '1–10' },
    })
    renderIssue({ signedIn: true })
    expect(await screen.findByRole('button', { name: 'Owned ✓' })).toBeDisabled()
    expect(
      screen.getByText('In Volume Nine. Edit editions on the comic’s page.'),
    ).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'I’ve read this' }))
    expect(edits.setMark).toHaveBeenCalledWith(ID, 58, 'read')
  })

  it('says what it marked and Undo posts the previous state back', async () => {
    stubApi({
      page: { state: 'missing' },
      stored: { ...STORED, issues_owned: '' },
    })
    renderIssue({ signedIn: true })
    await userEvent.click(
      await screen.findByRole('button', { name: 'I’ve read this' }),
    )
    const status = await screen.findByText('Marked read.')
    expect(status).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() =>
      expect(edits.setMark).toHaveBeenLastCalledWith(ID, 58, 'missing'),
    )
  })

  it('reads Owned ✓ for a single and marks it read on I’ve read this', async () => {
    stubApi()
    renderIssue({ signedIn: true })
    expect(
      await screen.findByRole('button', { name: COPY.owner.owned }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'I’ve read this' }))
    expect(edits.setMark).toHaveBeenCalledWith(ID, 58, 'read')
  })

  it('un-reads a read book back to owned', async () => {
    stubApi({ page: { state: 'read' } })
    renderIssue({ signedIn: true })
    await userEvent.click(await screen.findByRole('button', { name: 'Read ✓' }))
    expect(edits.setMark).toHaveBeenCalledWith(ID, 58, 'owned')
  })

  it('shows a refusal in the API’s words', async () => {
    stubApi({
      page: { state: 'missing' },
      stored: { ...STORED, issues_owned: '' },
    })
    vi.mocked(edits.setMark).mockRejectedValueOnce(
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

describe('ComicIssue, owner action then refresh', () => {
  /** The public page answers once, then holds the re-read until released. */
  function stubHeldReread() {
    let release
    let publicReads = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (String(url).includes('/api/public/items/')) {
          publicReads += 1
          if (publicReads === 1) {
            return { ok: true, status: 200, json: async () => PAGE }
          }
          await new Promise((resolve) => {
            release = resolve
          })
          return { ok: false, status: 503, json: async () => ({}) }
        }
        return { ok: true, status: 200, json: async () => STORED }
      }),
    )
    return () => release()
  }

  it('keeps the buttons busy until the re-read settles, ignoring a second press', async () => {
    const release = stubHeldReread()
    renderIssue({ signedIn: true })
    const button = await screen.findByRole('button', {
      name: COPY.owner.read,
    })
    await userEvent.click(button)
    expect(edits.setMark).toHaveBeenCalledTimes(1)
    // The write is done; the re-read is still out.
    await waitFor(() => expect(button).toBeDisabled())
    await userEvent.click(button)
    expect(edits.setMark).toHaveBeenCalledTimes(1)
    release()
    await waitFor(() => expect(button).toBeEnabled())
  })

  it('says the change was saved when the re-read after it fails', async () => {
    const release = stubHeldReread()
    renderIssue({ signedIn: true })
    await userEvent.click(
      await screen.findByRole('button', { name: COPY.owner.read }),
    )
    release()
    expect(await screen.findByText(SAVED_NOT_REFRESHED)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})
