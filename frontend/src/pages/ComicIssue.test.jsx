import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { spine } from '../content/spine.js'
import { LOAD_ERROR, SAVED_NOT_REFRESHED } from '../content/status.js'
import { axeViolations } from '../lib/axe.test-util.js'
import * as edits from '../lib/comicEdits.js'
import both from '../../e2e/fixtures/api/issue.json'
import single from '../../e2e/fixtures/api/issue-single.json'
import volumes from '../../e2e/fixtures/api/issue-volumes.json'
import ComicIssue from './ComicIssue.jsx'

vi.mock('../lib/comicEdits.js', () => ({
  setMark: vi.fn(async () => ({})),
  restoreSeries: vi.fn(async () => {}),
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
  held_single: true,
  also_in: [],
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
    stubApi({ page: { state: 'missing' } })
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
    stubApi({ page: { state: 'not-out' } })
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

  it('lists the Read fact and no Held as row', async () => {
    stubApi()
    renderIssue()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText('#58 of 72+')).toBeInTheDocument()
    expect(screen.getByText('Not yet')).toBeInTheDocument()
    expect(screen.queryByText('Held as')).toBeNull()
  })

  describe('the also-in line', () => {
    const held = () => document.querySelector('.comic-issue-held')

    it('says a single only', async () => {
      stubApi({ page: single })
      renderIssue()
      await screen.findByRole('heading', { level: 1 })
      expect(held()).toHaveTextContent(/^I have this as a single issue\.$/)
      expect(within(held()).queryByRole('link')).toBeNull()
    })

    it('lists the books when only volumes hold it, the other title named', async () => {
      stubApi({ page: volumes })
      renderIssue()
      await screen.findByRole('heading', { level: 1 })
      expect(held()).toHaveTextContent(
        'Also in: Lantern Tales, Book Two; Harbor Lights, Book One (Harbor Lights)',
      )
      expect(held()).not.toHaveTextContent('single issue')
      const links = within(held()).getAllByRole('link')
      expect(links.map((l) => l.textContent)).toEqual([
        'Lantern Tales, Book Two',
        'Harbor Lights, Book One (Harbor Lights)',
      ])
      expect(links.map((l) => l.getAttribute('href'))).toEqual([
        `/shelf/${volumes.also_in[0].title_id}/vol-2/`,
        `/shelf/${volumes.also_in[1].title_id}/vol-1/`,
      ])
    })

    it('says both a single and the books', async () => {
      stubApi({ page: both })
      renderIssue()
      await screen.findByRole('heading', { level: 1 })
      expect(held()).toHaveTextContent(
        'I have this as a single issue, and it is also in: Volume One; Harbor Lights, Book One (Harbor Lights)',
      )
      expect(within(held()).getAllByRole('link')).toHaveLength(2)
    })

    it('says nothing when it is not held', async () => {
      stubApi({
        page: { state: 'missing', held_single: false, also_in: [] },
      })
      renderIssue()
      await screen.findByRole('heading', { level: 1 })
      expect(held()).toBeNull()
    })

    it('has no leftover counted-once line or edition pill', async () => {
      stubApi({ page: both })
      renderIssue()
      await screen.findByRole('heading', { level: 1 })
      expect(document.body).not.toHaveTextContent(/counted once/i)
      expect(screen.queryByRole('link', { name: /→/ })).toBeNull()
    })

    it('has no accessibility violations with the links in', async () => {
      stubApi({ page: both })
      const { container } = renderIssue()
      await screen.findByRole('heading', { level: 1 })
      expect(await axeViolations(container)).toEqual([])
    })
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
    for (const link of links)
      expect(link).toHaveAttribute('href', PAGE.source_url)
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

  it('puts the strip under the issue with its heading, and Edit by the breadcrumb', async () => {
    stubApi()
    renderIssue({ signedIn: true })
    const strip = await screen.findByRole('list', {
      name: 'Neighboring issues',
    })
    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Neighboring issues',
    })
    const text = document.querySelector('.comic-issue-text')
    const follows = (a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
    expect(follows(text, heading)).toBeTruthy()
    expect(follows(heading, strip)).toBeTruthy()
    const edit = screen.getByRole('link', { name: 'Edit' })
    expect(edit.getAttribute('href')).toMatch(/^\/admin\/shelf\/comics\//)
    expect(document.querySelector('.crumbs-bar')).toContainElement(edit)
  })

  it('shows no Edit link signed out', async () => {
    stubApi()
    renderIssue()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
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
      page: { state: 'missing' },
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
        held_single: false,
        also_in: [
          {
            slug: 'ed-55-60',
            label: 'Volume Nine',
            kind: 'trade',
            line_number: null,
            title_id: ID,
            title: 'Saga',
            same_title: true,
          },
        ],
      },
      stored: { ...STORED, issues_owned: '1–10' },
    })
    renderIssue({ signedIn: true })
    expect(
      await screen.findByRole('button', { name: 'Owned ✓' }),
    ).toBeDisabled()
    expect(
      screen.getByText('In Volume Nine. Change that on the book’s page.'),
    ).toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: 'I’ve read this' }),
    )
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
    await userEvent.click(
      screen.getByRole('button', { name: 'I’ve read this' }),
    )
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

describe('ComicIssue, Undo', () => {
  it('Undo of owning a skipped issue puts the skip back, and focus returns to Owned', async () => {
    vi.mocked(edits.setMark).mockResolvedValue({ previous: null })
    stubApi({
      page: { state: 'missing' },
      stored: { ...STORED, issues_owned: '1–10', issues_skipped: '58' },
    })
    renderIssue({ signedIn: true })
    await userEvent.click(
      await screen.findByRole('button', { name: 'I own this' }),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() =>
      expect(edits.setMark).toHaveBeenLastCalledWith(ID, 58, 'missing'),
    )
    expect(edits.toggleSkip).toHaveBeenCalledWith(ID, 58)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'I own this' })).toHaveFocus(),
    )
  })

  it('Undo of the first tap on a Want restores what it moved', async () => {
    vi.mocked(edits.setMark).mockResolvedValueOnce({
      previous: { owned_format: 'none' },
    })
    stubApi({
      page: { state: 'missing' },
      stored: { ...STORED, issues_owned: '', issues_skipped: null },
    })
    renderIssue({ signedIn: true })
    await userEvent.click(
      await screen.findByRole('button', { name: 'I own this' }),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() =>
      expect(edits.restoreSeries).toHaveBeenCalledWith(ID, {
        owned_format: 'none',
      }),
    )
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
