import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { axeViolations } from '../../lib/axe.test-util.js'
import { entry, fakeIntakeApi } from '../../lib/intake.test-util.js'
import AddSection from './AddSection.jsx'

const media = { phone: false }
vi.mock('../../lib/useMediaQuery.js', () => ({
  useMediaQuery: (query) => query === '(max-width: 900px)' && media.phone,
}))

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function renderAt(area = 'shelf', onAdded = vi.fn()) {
  const home = area === 'closet' ? '/admin/closet' : '/admin/collection'
  render(
    <MemoryRouter initialEntries={[home]}>
      <Routes>
        <Route
          path={home}
          element={
            <AddSection area={area} onAdded={onAdded}>
              <p>the grid</p>
            </AddSection>
          }
        />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
  return onAdded
}

const result = (kind, id, title, extra = {}) => ({
  kind,
  external_source: { comic: 'comicvine', game: 'igdb', movie: 'tmdb' }[kind],
  external_id: id,
  title,
  year: 2012,
  thumbnail_url: null,
  owned_item_id: null,
  ...extra,
})

const SAGA = {
  results: [
    result('comic', 'cv-1', 'Saga'),
    result('game', 'ig-9', 'SaGa Frontier', { year: 2021 }),
    result('comic', 'cv-7', 'Saga of the Swamp Thing', {
      owned_item_id: 'item-7',
    }),
  ],
  sources: [
    { kind: 'game', state: 'ok', reason: null },
    {
      kind: 'movie',
      state: 'busy',
      reason: 'tmdb is busy; try again in a moment',
    },
    { kind: 'comic', state: 'ok', reason: null },
    {
      kind: 'boardgame',
      state: 'not_configured',
      reason: 'BGG unavailable: it needs a registered app',
    },
  ],
}

async function search(user, query = 'saga') {
  const field = await screen.findByRole('searchbox', { name: 'Add' })
  await user.type(field, `${query}{Enter}`)
  return field
}

afterEach(() => {
  media.phone = false
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AddSection on the shelf', () => {
  it('searches every source on submit and labels each result with its kind', async () => {
    const user = userEvent.setup()
    const api = fakeIntakeApi({ search: () => SAGA })
    renderAt()
    await search(user)
    const list = await screen.findByRole('list', { name: 'Results for “saga”' })
    const rows = within(list).getAllByRole('listitem')
    expect(
      rows.map((row) => row.querySelector('.intake-result-kind').textContent),
    ).toEqual(['Comic', 'Game', 'Comic'])
    // An owned result links to it instead of adding it twice.
    const owned = rows[2]
    expect(
      within(owned).getByRole('link', { name: /On shelf/ }),
    ).toHaveAttribute('href', '/admin/collection/item-7')
    expect(within(owned).queryByRole('button', { name: /^Add/ })).toBeNull()
    expect(api.calls('GET', /\/api\/intake\/search/)[0].url).toBe(
      '/api/intake/search?area=shelf&query=saga',
    )
    // Per-source states, in words; a source with no credentials is a
    // disabled way in with its reason (AC 11).
    expect(
      screen.getByText('Movie: tmdb is busy; try again in a moment'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Search Board game' }),
    ).toBeDisabled()
    expect(
      screen.getByText(
        'Board game search is off: BGG unavailable: it needs a registered app',
      ),
    ).toBeInTheDocument()
    expect(await axeViolations(document.querySelector('.intake-add'))).toEqual(
      [],
    )
  })

  it('adds a result through the commit service from the drawer', async () => {
    const user = userEvent.setup()
    const api = fakeIntakeApi({ search: () => SAGA })
    const onAdded = renderAt()
    await search(user)
    const add = await screen.findByRole('button', { name: 'Add Saga' })
    await user.click(add)
    const drawer = screen.getByRole('dialog', { name: 'Saga' })
    expect(within(drawer).getByText('Comic · comicvine')).toBeInTheDocument()
    await user.type(within(drawer).getByLabelText('Issues owned'), '1-6')
    await user.click(
      within(drawer).getByRole('button', { name: 'Add to shelf' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const [sent] = api.calls('POST', /\/api\/intake\/add$/)
    expect(sent.body).toMatchObject({
      kind: 'comic',
      chosen: { external_id: 'cv-1', title: 'Saga' },
      payload: { issues_owned: '1-6' },
    })
    expect(sent.body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(onAdded).toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Saga added, private')
    expect(screen.getByRole('searchbox')).toHaveValue('saga')
    expect(screen.getByRole('list', { name: /Results/ })).toBeInTheDocument()
    expect(add).toHaveFocus()
  })

  it('says how many issues an owned series gained', async () => {
    const user = userEvent.setup()
    fakeIntakeApi({
      search: () => SAGA,
      add: () => ({
        status: 200,
        body: {
          added: 0,
          already_owned: 0,
          issues_added: 2,
          created: [],
          garment_id: null,
        },
      }),
    })
    renderAt()
    await search(user)
    await user.click(await screen.findByRole('button', { name: 'Add Saga' }))
    const drawer = screen.getByRole('dialog', { name: 'Saga' })
    await user.type(within(drawer).getByLabelText('Issues owned'), '3-4')
    await user.click(
      within(drawer).getByRole('button', { name: 'Add to shelf' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('status')).toHaveTextContent(
      'Added 2 issues to Saga',
    )
  })

  it('closes on Escape, traps focus while open, and returns it to Add', async () => {
    const user = userEvent.setup()
    fakeIntakeApi({ search: () => SAGA })
    renderAt()
    await search(user)
    const add = await screen.findByRole('button', { name: 'Add SaGa Frontier' })
    await user.click(add)
    const drawer = screen.getByRole('dialog', { name: 'SaGa Frontier' })
    expect(drawer).toContainElement(document.activeElement)
    const cancel = within(drawer).getByRole('button', { name: 'Cancel' })
    cancel.focus()
    await user.tab()
    expect(drawer).toContainElement(document.activeElement)
    await user.tab({ shift: true })
    expect(cancel).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(add).toHaveFocus()
  })

  it('keeps a search with no match as typed: a manual row', async () => {
    const user = userEvent.setup()
    const api = fakeIntakeApi()
    renderAt()
    await search(user, 'Heat')
    expect(await screen.findByText('No match for “Heat”.')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Keep as a typed Movie' }),
    )
    const drawer = screen.getByRole('dialog', { name: 'Heat' })
    expect(within(drawer).getByLabelText('Title')).toHaveValue('Heat')
    await user.click(
      within(drawer).getByRole('button', { name: 'Add to shelf' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const [sent] = api.calls('POST', /\/api\/intake\/add$/)
    expect(sent.body).toMatchObject({
      kind: 'movie',
      chosen: null,
      payload: { title: 'Heat' },
    })
  })

  it('commits an unconfigured source’s kind as typed (AC 11)', async () => {
    const user = userEvent.setup()
    const api = fakeIntakeApi({ search: () => SAGA })
    renderAt()
    await search(user, 'Wingspan')
    await user.click(
      await screen.findByRole('button', { name: 'Keep as a typed Board game' }),
    )
    const drawer = screen.getByRole('dialog', { name: 'Wingspan' })
    expect(
      within(drawer).getByText('Board game · kept as typed'),
    ).toBeInTheDocument()
    await user.click(
      within(drawer).getByRole('button', { name: 'Add to shelf' }),
    )
    await waitFor(() =>
      expect(api.calls('POST', /\/api\/intake\/add$/)).toHaveLength(1),
    )
    expect(api.calls('POST', /\/api\/intake\/add$/)[0].body).toMatchObject({
      kind: 'boardgame',
      chosen: null,
      payload: { title: 'Wingspan' },
    })
  })

  it('adds and searches again: the bar cleared and focused', async () => {
    const user = userEvent.setup()
    fakeIntakeApi({ search: () => SAGA })
    renderAt()
    const field = await search(user)
    await user.click(await screen.findByRole('button', { name: 'Add Saga' }))
    await user.click(
      screen.getByRole('button', { name: 'Add and search again' }),
    )
    await waitFor(() => expect(field).toHaveFocus())
    expect(field).toHaveValue('')
    expect(screen.queryByRole('list', { name: /Results/ })).toBeNull()
  })

  it('shows the write path’s refusal beside its field and stays open', async () => {
    const user = userEvent.setup()
    fakeIntakeApi({
      search: () => SAGA,
      add: () => ({
        status: 422,
        body: {
          detail: 'Issue ranges run low to high',
          refused: [
            {
              entry_id: 'x',
              field: 'issues_owned',
              message: 'Issue ranges run low to high',
            },
          ],
        },
      }),
    })
    renderAt()
    await search(user)
    await user.click(await screen.findByRole('button', { name: 'Add Saga' }))
    await user.click(screen.getByRole('button', { name: 'Add to shelf' }))
    const drawer = screen.getByRole('dialog', { name: 'Saga' })
    expect(
      await within(drawer).findByText('Issue ranges run low to high'),
    ).toBeInTheDocument()
    expect(within(drawer).getByLabelText('Issues owned')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  it('says why when the refusal names a field the drawer does not draw', async () => {
    const user = userEvent.setup()
    fakeIntakeApi({
      search: () => SAGA,
      add: () => ({
        status: 422,
        body: {
          detail: 'Year must be a four-digit year',
          refused: [
            {
              entry_id: 'x',
              field: 'year',
              message: 'Year must be a four-digit year',
            },
          ],
        },
      }),
    })
    renderAt()
    await search(user)
    await user.click(await screen.findByRole('button', { name: 'Add Saga' }))
    await user.click(screen.getByRole('button', { name: 'Add to shelf' }))
    const drawer = screen.getByRole('dialog', { name: 'Saga' })
    expect(await within(drawer).findByRole('alert')).toHaveTextContent(
      'Year must be a four-digit year',
    )
  })

  it('is a modal bottom sheet below 900px', async () => {
    media.phone = true
    // jsdom has no showModal; the sheet is a native modal dialog (Sheet).
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '')
    }
    onTestFinished(() => delete HTMLDialogElement.prototype.showModal)
    const user = userEvent.setup()
    fakeIntakeApi({ search: () => SAGA })
    renderAt()
    await search(user)
    await user.click(await screen.findByRole('button', { name: 'Add Saga' }))
    const drawer = screen.getByRole('dialog', { name: 'Saga' })
    expect(drawer.tagName).toBe('DIALOG')
    expect(drawer).toHaveAttribute('open')
    expect(drawer).toHaveClass('intake-drawer-sheet')
  })

  it('shows an unfinished sitting as one line with Resume', async () => {
    fakeIntakeApi({
      sittings: [
        {
          id: 's1',
          area: 'shelf',
          kind: 'comic',
          label: 'Longbox 1',
          entries: [
            entry('e1', 'check'),
            entry('e2', 'exact'),
            entry('e3', 'exact'),
          ],
        },
      ],
    })
    renderAt()
    const line = await screen.findByText(/is unfinished/)
    expect(line).toHaveTextContent(
      'Longbox 1 is unfinished · 1 to check, 2 ready',
    )
    expect(
      screen.getByRole('link', { name: 'Resume Longbox 1' }),
    ).toHaveAttribute('href', '/admin/collection/add/s1')
    expect(screen.getByText('the grid')).toBeInTheDocument()
  })

  it('counts several unfinished sittings and links to the list', async () => {
    const sitting = (id) => ({
      id,
      area: 'shelf',
      kind: 'comic',
      label: 'Comic · Nov 11',
      entries: [entry(`e${id}`, 'check')],
    })
    fakeIntakeApi({ sittings: [sitting('s1'), sitting('s2')] })
    renderAt()
    const line = await screen.findByText(/are unfinished/)
    expect(line).toHaveTextContent('2 sittings are unfinished')
    expect(
      screen.getByRole('link', { name: /See them on the Add page/ }),
    ).toHaveAttribute('href', '/admin/collection/add')
    expect(screen.queryByText('Comic · Nov 11')).not.toBeInTheDocument()
  })

  it('sends ▤ Photos to the Add page to choose a kind', async () => {
    const user = userEvent.setup()
    fakeIntakeApi()
    renderAt()
    expect(
      await screen.findByRole('button', { name: /Scan a barcode/ }),
    ).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Add from photos' }))
    expect(await screen.findByTestId('where')).toHaveTextContent(
      '/admin/collection/add',
    )
  })
})

describe('AddSection in the Closet', () => {
  it('types a piece by hand: no search, the garment’s fields', async () => {
    const user = userEvent.setup()
    const api = fakeIntakeApi()
    const onAdded = renderAt('closet')
    const field = await screen.findByRole('textbox', { name: 'Add' })
    expect(field).toHaveAttribute(
      'placeholder',
      'Type a piece to add it by hand, or ▤ Photos, one per piece',
    )
    await user.type(field, 'Navy blazer{Enter}')
    const drawer = screen.getByRole('dialog', { name: 'Navy blazer' })
    expect(within(drawer).getByLabelText('Name')).toHaveValue('Navy blazer')
    await user.click(
      within(drawer).getByRole('button', { name: 'Add to closet' }),
    )
    await waitFor(() => expect(onAdded).toHaveBeenCalled())
    await waitFor(() => expect(field).toHaveValue(''))
    expect(field).toHaveFocus()
    expect(api.calls('GET', /\/api\/intake\/search/)).toEqual([])
    expect(api.calls('POST', /\/api\/intake\/add$/)[0].body).toMatchObject({
      kind: 'garment',
      chosen: null,
      payload: { name: 'Navy blazer' },
    })
  })

  it('keeps the typed text when nothing was added (a duplicate)', async () => {
    const user = userEvent.setup()
    fakeIntakeApi({
      add: () => ({
        status: 201,
        body: { added: 0, already_owned: 1, issues_added: 0, created: [] },
      }),
    })
    renderAt('closet')
    const field = await screen.findByRole('textbox', { name: 'Add' })
    await user.type(field, 'Navy blazer{Enter}')
    const drawer = screen.getByRole('dialog', { name: 'Navy blazer' })
    await user.click(
      within(drawer).getByRole('button', { name: 'Add to closet' }),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Navy blazer' }),
      ).not.toBeInTheDocument(),
    )
    expect(field).toHaveValue('Navy blazer')
  })

  it('goes straight to Shoot from ▤ Photos: the closet has one photo kind', async () => {
    const user = userEvent.setup()
    const api = fakeIntakeApi()
    renderAt('closet')
    await user.click(
      await screen.findByRole('button', { name: 'Add from photos' }),
    )
    expect(await screen.findByTestId('where')).toHaveTextContent(
      '/admin/closet/add/new-1',
    )
    expect(api.calls('POST', /\/api\/intake\/sittings$/)[0].body).toMatchObject(
      {
        area: 'closet',
        kind: 'garment',
      },
    )
  })
})
