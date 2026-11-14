import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import { ACTION_ERROR, LOAD_ERROR } from '../content/status.js'
import AdminPullList from './AdminPullList.jsx'

const issue = (title, number, fields = {}) => ({
  item_id: `id-${title}`,
  title,
  publisher: 'Image',
  number,
  name: null,
  store_date: '2026-11-04',
  cover_url: null,
  owned_text: '1–72',
  released: 72,
  on_shelf: true,
  ...fields,
})

const PULL = {
  following: 2,
  last_refresh: '2026-10-31',
  weeks: [
    {
      start: '2026-11-02',
      this_week: true,
      rows: [
        issue('Saga', '73'),
        issue('Saga', '74'),
        issue('Monstress', 'Annual 1', { owned_text: '1–56', released: 56 }),
      ],
    },
    { start: '2026-11-09', this_week: false, rows: [] },
  ],
  undated: [{ item_id: 'id-Paper Girls', title: 'Paper Girls' }],
}

const RESULTS = [
  {
    external_id: '49901',
    title: 'Saga',
    year: 2012,
    publisher: 'Image',
    issue_count: 72,
    thumbnail_url: null,
    item_id: 'id-Saga',
    in_shelf: true,
    wanted: false,
    following: true,
  },
  {
    external_id: '1234',
    title: 'Absolute Batman',
    year: 2024,
    publisher: 'DC',
    issue_count: 12,
    thumbnail_url: null,
    item_id: null,
    in_shelf: false,
    wanted: false,
    following: false,
  },
]

const ok = (body) => ({ ok: true, status: 200, json: async () => body })

function stubApi(handlers = {}) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      const path = String(url).replace(/^.*\/api/, '/api')
      const method = options.method ?? 'GET'
      calls.push({ method, path, body: options.body })
      const handler = handlers[`${method} ${path.split('?')[0]}`]
      if (handler) return handler(options)
      if (path === '/api/comics/pull-list') return ok(PULL)
      if (path.startsWith('/api/comics/search')) return ok(RESULTS)
      return ok({})
    }),
  )
  return calls
}

/** The new-item page's stand-in: shows the prefill it was handed. */
function Arrival() {
  const { state } = useLocation()
  return <pre data-testid="prefill">{JSON.stringify(state?.prefill)}</pre>
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/pull-list']}>
      <Routes>
        <Route path="admin/pull-list" element={<AdminPullList />} />
        <Route path="admin/shelf/games" element={<Arrival />} />
        <Route path="admin/shelf/comics/:id" element={<p>Item page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

async function search(text = 'batman') {
  await userEvent.type(screen.getByLabelText('Series name'), text)
  await userEvent.click(screen.getByRole('button', { name: 'Search' }))
}

describe('AdminPullList', () => {
  it('lists each week, an empty one included, and the undated series', async () => {
    stubApi()
    renderPage()
    const week = await screen.findByRole('region', { name: /Week of Nov 2/ })
    expect(week).toHaveTextContent('this week')
    expect(
      within(week).getByRole('link', { name: 'Saga #73' }),
    ).toHaveAttribute('href', '/admin/shelf/comics/id-Saga')
    expect(week).toHaveTextContent('Image · Nov 4 · own 1–72 of 72')
    expect(
      screen.getByRole('region', { name: /Week of Nov 9/ }),
    ).toHaveTextContent('Nothing out.')
    expect(screen.getByText('No store date yet: Paper Girls.')).toBeVisible()
    expect(
      screen.getByText(/Following 2 series · last refresh Oct 31/),
    ).toBeVisible()
  })

  it('offers Got it and Skip only on a whole issue number', async () => {
    stubApi()
    renderPage()
    await screen.findByRole('link', { name: 'Saga #73' })
    expect(
      screen.getByRole('button', { name: 'Got it: Saga #73' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Got it: Monstress #Annual 1' }),
    ).not.toBeInTheDocument()
  })

  it('Got it strikes the row and every row of the series takes the new ranges', async () => {
    const calls = stubApi({
      'POST /api/comics/id-Saga/issues/73/got': () =>
        ok({ item_id: 'id-Saga', issues_owned: '1–73' }),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Got it: Saga #73' }),
    )
    expect(calls.at(-1)).toMatchObject({
      method: 'POST',
      path: '/api/comics/id-Saga/issues/73/got',
    })
    // The answered row's buttons are gone; the status line holds focus.
    expect(screen.getByText('Got Saga #73.')).toHaveFocus()
    const done = screen.getByRole('link', { name: 'Saga #73' }).closest('li')
    expect(done).toHaveClass('pull-row-done')
    expect(
      screen.queryByRole('button', { name: 'Got it: Saga #73' }),
    ).not.toBeInTheDocument()
    const next = screen.getByRole('link', { name: 'Saga #74' }).closest('li')
    expect(next).toHaveTextContent('own 1–73 of 72')
  })

  it('Skip records the skip and says so', async () => {
    const calls = stubApi({
      'POST /api/comics/id-Saga/issues/74/skip': () =>
        ok({ item_id: 'id-Saga', issues_owned: '1–72' }),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Skip: Saga #74' }),
    )
    expect(calls.at(-1).path).toBe('/api/comics/id-Saga/issues/74/skip')
    expect(screen.getByText('Skipped Saga #74.')).toBeVisible()
  })

  it('shows a failed answer as an alert and keeps the buttons', async () => {
    stubApi({
      'POST /api/comics/id-Saga/issues/74/skip': () => ({
        ok: false,
        status: 409,
        json: async () => ({ detail: '#74 is already owned' }),
      }),
      'POST /api/comics/id-Saga/issues/73/got': () => {
        throw new TypeError('offline')
      },
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Skip: Saga #74' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('#74 is already owned')
    await userEvent.click(
      screen.getByRole('button', { name: 'Got it: Saga #73' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(ACTION_ERROR)
    expect(
      screen.getByRole('button', { name: 'Skip: Saga #74' }),
    ).toBeInTheDocument()
  })

  it('sends one answer at a time', async () => {
    let answer
    const calls = stubApi({
      'POST /api/comics/id-Saga/issues/73/got': () =>
        new Promise((resolve) => {
          answer = () =>
            resolve(ok({ item_id: 'id-Saga', issues_owned: '1–73' }))
        }),
    })
    renderPage()
    const got = await screen.findByRole('button', { name: 'Got it: Saga #73' })
    await userEvent.click(got)
    await userEvent.click(got)
    await userEvent.click(
      screen.getByRole('button', { name: 'Skip: Saga #73' }),
    )
    expect(got).toHaveAttribute('aria-disabled', 'true')
    answer()
    expect(await screen.findByText('Got Saga #73.')).toBeVisible()
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
  })

  it('keeps the list and its Refresh when the re-read fails', async () => {
    let reads = 0
    stubApi({
      'GET /api/comics/pull-list': () =>
        (reads += 1) === 1 ? ok(PULL) : { ok: false, status: 503 },
      'POST /api/comics/refresh': () =>
        ok({ ok: true, refreshed: 2, errors: [] }),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Refresh' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(LOAD_ERROR)
    expect(screen.getByRole('link', { name: 'Saga #73' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
  })

  it('refreshes the followed series and names any that failed', async () => {
    const calls = stubApi({
      'POST /api/comics/refresh': () =>
        ok({
          ok: false,
          refreshed: 1,
          errors: [{ item_id: 'id-Monstress', title: 'Monstress' }],
        }),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Refresh' }),
    )
    expect(
      await screen.findByText(
        'Refreshed 1 series. Couldn’t refresh Monstress.',
      ),
    ).toBeVisible()
    expect(
      calls.filter((c) => c.path === '/api/comics/pull-list'),
    ).toHaveLength(2)
  })

  it('searches series and marks what the shelf holds', async () => {
    stubApi()
    renderPage()
    await search()
    expect(await screen.findByText('DC · 2024 · 12 issues')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Follow: Saga' }),
    ).toHaveAttribute('aria-pressed', 'true')
    // On the shelf: no Want, and Own… is Edit on the item.
    expect(
      screen.queryByRole('button', { name: 'Want: Saga' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit: Saga' })).toHaveAttribute(
      'href',
      '/admin/shelf/comics/id-Saga',
    )
  })

  it('follows a series and reloads the pull list', async () => {
    const calls = stubApi({
      'POST /api/comics/follow': () =>
        ok({ item_id: 'id-new', following: true }),
    })
    renderPage()
    await search()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Follow: Absolute Batman' }),
    )
    const follow = calls.find((c) => c.path === '/api/comics/follow')
    expect(JSON.parse(follow.body)).toEqual({ external_id: '1234' })
    expect(
      screen.getByRole('button', { name: 'Follow: Absolute Batman' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Following Absolute Batman.')).toBeVisible()
    expect(
      calls.filter((c) => c.path === '/api/comics/pull-list'),
    ).toHaveLength(2)
  })

  it('wants a series, and shows a refused want’s reason', async () => {
    stubApi({
      'POST /api/comics/want': () => ({
        ok: false,
        status: 409,
        json: async () => ({ detail: 'Already on your shelf' }),
      }),
    })
    renderPage()
    await search()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Want: Absolute Batman' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Absolute Batman: Already on your shelf',
    )
  })

  it('Own… opens the new-item form prefilled from the volume', async () => {
    stubApi()
    renderPage()
    await search()
    await userEvent.click(
      await screen.findByRole('link', { name: 'Own: Absolute Batman' }),
    )
    expect(JSON.parse(screen.getByTestId('prefill').textContent)).toEqual({
      type: 'comic',
      title: 'Absolute Batman',
      year: 2024,
      external_source: 'comicvine',
      external_id: '1234',
      owned_format: 'physical',
      status: 'backlog',
    })
  })

  it('has no axe violations', async () => {
    stubApi()
    const { container } = renderPage()
    await search()
    await screen.findByText('DC · 2024 · 12 issues')
    expect(await axeViolations(container)).toEqual([])
  })
})
