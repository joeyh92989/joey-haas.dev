import '@testing-library/jest-dom'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import {
  candidate,
  entry,
  fakeIntakeApi,
  photo,
} from '../lib/intake.test-util.js'
import AdminSitting from './AdminSitting.jsx'

function renderSitting(id = 's1', area = 'collection') {
  return render(
    <MemoryRouter initialEntries={[`/admin/${area}/add/${id}`]}>
      <Routes>
        <Route
          path="/admin/collection/add/:sittingId"
          element={<AdminSitting />}
        />
        <Route path="/admin/closet/add/:sittingId" element={<AdminSitting />} />
        <Route path="/admin/collection/add" element={<p>Add page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const SANDMAN = candidate(1, 'The Sandman', 1989)
const UNIVERSE = candidate(2, 'The Sandman Universe', 2018)

/** A comic sitting with one photo read: one to check, two exact, one owned. */
function longbox(extra = {}) {
  return {
    id: 's1',
    area: 'shelf',
    kind: 'comic',
    label: 'Longbox 1',
    photos: [photo('p1', 'read')],
    entries: [
      entry('e1', 'check', {
        photo_id: 'p1',
        payload: { detected_title: 'SANDMAN' },
        candidates: [SANDMAN, UNIVERSE],
        chosen: SANDMAN,
      }),
      entry('e2', 'exact', { photo_id: 'p1', chosen: candidate(3, 'Saga') }),
      entry('e3', 'exact', {
        photo_id: 'p1',
        chosen: candidate(4, 'East of West'),
      }),
      entry('e4', 'owned', {
        photo_id: 'p1',
        chosen: candidate(5, 'Swamp Thing'),
      }),
    ],
    ...extra,
  }
}

const steps = () => screen.getByRole('list', { name: 'Steps' })
const currentStep = () =>
  within(steps())
    .getAllByRole('listitem')
    .find((li) => li.getAttribute('aria-current') === 'step')

async function press(user, element) {
  element.focus()
  await user.keyboard('{Enter}')
}

describe('AdminSitting', () => {
  it('asks a probable match one at a time instead of skimming it', async () => {
    const user = userEvent.setup()
    const saga = candidate(3, 'Saga', 2012)
    const api = fakeIntakeApi({
      sittings: [
        longbox({
          step: 'check',
          entries: [
            entry('e1', 'probable', {
              photo_id: 'p1',
              payload: { detected_title: 'SAGA' },
              candidates: [saga],
              chosen: saga,
            }),
            entry('e2', 'exact', {
              photo_id: 'p1',
              chosen: candidate(4, 'East of West'),
            }),
          ],
        }),
      ],
    })
    renderSitting()

    const group = await screen.findByRole('radiogroup', {
      name: 'Which one is it?',
    })
    expect(within(group).getByRole('radio', { name: /^Saga/ })).toBeChecked()
    expect(screen.getByText('Probable')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Saga' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'East of West' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Yes, this one' }))
    await waitFor(() =>
      expect(api.calls('PATCH', /\/entries\/e1$/)[0]?.body).toEqual({
        state: 'ready',
        chosen: saga,
      }),
    )
  })

  it('splits the Shoot count into parts that add up (#159)', async () => {
    fakeIntakeApi({
      sittings: [
        longbox({
          step: 'shoot',
          photos: [photo('p1', 'read'), photo('p2', 'reading')],
          entries: [
            ...longbox().entries,
            entry('t1', 'typed', { payload: { title: 'Lost zine' } }),
            entry('r1', 'ready', { chosen: candidate(9, 'Paper Girls') }),
            entry('p9', 'probable', { photo_id: 'p1', chosen: SANDMAN }),
            entry('x1', 'ignored', { photo_id: 'p1' }),
          ],
        }),
      ],
    })
    renderSitting()
    expect(
      await screen.findByText(
        '7 titles so far · 4 ready · 2 to check · 1 on the shelf · 1 photo waiting to be read',
      ),
    ).toBeInTheDocument()
  })

  it('keeps reading and unticked entries in the total and counts unread photos apart', async () => {
    fakeIntakeApi({
      sittings: [
        longbox({
          step: 'shoot',
          photos: [
            photo('p1', 'read'),
            photo('p2', 'reading'),
            photo('p3', 'uploaded'),
          ],
          entries: [
            entry('e2', 'exact', { chosen: candidate(3, 'Saga') }),
            entry('e5', 'reading', { photo_id: 'p2' }),
            entry('u1', 'ignored', {
              chosen: candidate(4, 'East of West'),
              payload: { unticked: true, was: 'exact' },
            }),
          ],
        }),
      ],
    })
    renderSitting()
    expect(
      await screen.findByText(
        '3 titles so far · 1 ready · 1 reading · 1 unticked · 2 photos waiting to be read',
      ),
    ).toBeInTheDocument()
  })

  it('drops zero parts from the Shoot count', async () => {
    fakeIntakeApi({
      sittings: [
        longbox({
          step: 'shoot',
          photos: [photo('p1', 'read')],
          entries: [entry('e2', 'exact', { chosen: candidate(3, 'Saga') })],
        }),
      ],
    })
    renderSitting()
    expect(
      await screen.findByText('1 title so far · 1 ready'),
    ).toBeInTheDocument()
  })

  it('counts pieces in a closet sitting (#165)', async () => {
    fakeIntakeApi({
      sittings: [
        {
          id: 'c1',
          area: 'closet',
          kind: 'garment',
          label: 'Rack',
          photos: [photo('p1', 'read'), photo('p2', 'read')],
          entries: [
            entry('g1', 'check', { photo_id: 'p1' }),
            entry('g2', 'check', { photo_id: 'p2' }),
          ],
        },
      ],
    })
    renderSitting('c1', 'closet')
    expect(await screen.findByText(/^2 pieces so far/)).toBeInTheDocument()
  })

  it('shows searched and typed titles ticked on Check, and reticks them (#165)', async () => {
    const user = userEvent.setup()
    const api = fakeIntakeApi({
      sittings: [
        longbox({
          step: 'check',
          photos: [],
          entries: [
            entry('r1', 'ready', { chosen: candidate(9, 'Paper Girls') }),
            entry('t1', 'typed', { payload: { title: 'Lost zine' } }),
          ],
        }),
      ],
    })
    renderSitting()
    const zine = await screen.findByRole('checkbox', { name: 'Lost zine' })
    expect(zine).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Paper Girls' })).toBeChecked()
    await user.click(zine)
    await waitFor(() =>
      expect(api.calls('PATCH', /\/entries\/t1$/)[0]?.body).toMatchObject({
        state: 'ignored',
        payload: { unticked: true, was: 'typed' },
      }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: 'Lost zine' }),
      ).not.toBeChecked(),
    )
    await user.click(screen.getByRole('checkbox', { name: 'Lost zine' }))
    await waitFor(() =>
      expect(api.calls('PATCH', /\/entries\/t1$/)[1]?.body.state).toBe('typed'),
    )
  })

  it('renders no empty hint paragraph when there is no grid', async () => {
    fakeIntakeApi({
      sittings: [
        longbox({
          step: 'check',
          entries: [
            entry('e1', 'check', {
              photo_id: 'p1',
              payload: { detected_title: 'SANDMAN' },
              candidates: [SANDMAN, UNIVERSE],
              chosen: SANDMAN,
            }),
          ],
        }),
      ],
    })
    renderSitting()
    await screen.findByRole('heading', { name: 'Check' })
    const empty = [...document.querySelectorAll('.intake-bar p')].filter(
      (p) => !p.textContent.trim(),
    )
    expect(empty).toHaveLength(0)
  })

  it('drops the grid sentence when there is no grid', async () => {
    fakeIntakeApi({
      sittings: [
        longbox({
          step: 'check',
          entries: [
            entry('e1', 'check', {
              photo_id: 'p1',
              payload: { detected_title: 'SANDMAN' },
              candidates: [SANDMAN],
            }),
          ],
        }),
      ],
    })
    renderSitting()
    await screen.findByRole('radiogroup', { name: 'Which one is it?' })
    expect(screen.queryByText(/exact matches are a grid/)).toBeNull()
  })

  it('walks Shoot to Done by keyboard, saving each step', async () => {
    const user = userEvent.setup()
    const api = fakeIntakeApi({ sittings: [longbox()] })
    renderSitting()

    expect(await screen.findByRole('heading', { name: 'Shoot' })).toBeVisible()
    expect(currentStep()).toHaveTextContent('Shoot')

    await press(user, screen.getByRole('button', { name: /Start checking/ }))
    const check = await screen.findByRole('heading', { name: 'Check' })
    expect(check).toHaveFocus()
    expect(currentStep()).toHaveTextContent('Check')
    expect(api.calls('PATCH', /\/sittings\/s1$/).at(-1).body).toEqual({
      step: 'check',
    })

    // One at a time: the read text, the best candidate preselected.
    expect(screen.getByText('SANDMAN')).toBeInTheDocument()
    const group = screen.getByRole('radiogroup', { name: 'Which one is it?' })
    expect(
      within(group).getByRole('radio', { name: /^The Sandman \(1989\)/ }),
    ).toBeChecked()
    await user.click(
      within(group).getByRole('radio', { name: /The Sandman Universe/ }),
    )
    await press(user, screen.getByRole('button', { name: 'Yes, this one' }))
    await waitFor(() =>
      expect(api.calls('PATCH', /\/entries\/e1$/)[0]?.body).toEqual({
        state: 'ready',
        chosen: UNIVERSE,
      }),
    )
    expect(
      await screen.findByText('Nothing left to check one at a time.'),
    ).toBeInTheDocument()

    // The skim grid: exact ticked, owned dimmed and unticked.
    expect(screen.getByRole('checkbox', { name: 'Saga' })).toBeChecked()
    const owned = screen.getByRole('checkbox', { name: 'Swamp Thing' })
    expect(owned).not.toBeChecked()
    expect(owned).toBeDisabled()
    screen.getByRole('checkbox', { name: 'East of West' }).focus()
    await user.keyboard(' ')
    await waitFor(() =>
      expect(api.calls('PATCH', /\/entries\/e3$/)[0]?.body).toMatchObject({
        state: 'ignored',
        payload: { unticked: true, was: 'exact' },
      }),
    )
    expect(
      screen.getByRole('checkbox', { name: 'East of West' }),
    ).not.toBeChecked()

    await press(user, screen.getByRole('button', { name: /Details/ }))
    expect(
      await screen.findByRole('heading', { name: 'Details' }),
    ).toHaveFocus()

    // Set for all, then one row's own field.
    const all = screen.getByRole('group', { name: 'Set for all 2 comics' })
    await user.selectOptions(
      within(all).getByLabelText('Shelf format'),
      'trades',
    )
    await user.click(within(all).getByRole('button', { name: 'Apply' }))
    await waitFor(() =>
      expect(
        api.calls('PATCH', /\/entries\/e(1|2)$/).map((call) => call.body),
      ).toEqual(
        expect.arrayContaining([
          { payload: { detected_title: 'SANDMAN', shelf_format: 'trades' } },
          { payload: { shelf_format: 'trades' } },
        ]),
      ),
    )
    const saga = screen.getByRole('group', { name: 'Saga' })
    await user.type(within(saga).getByLabelText('Issues owned'), '1-54')
    await user.tab()
    await waitFor(() =>
      expect(api.calls('PATCH', /\/entries\/e2$/).at(-1).body).toEqual({
        payload: { shelf_format: 'trades', issues_owned: '1-54' },
      }),
    )

    await press(
      user,
      screen.getByRole('button', { name: 'Add 2 to the shelf' }),
    )
    expect(await screen.findByRole('heading', { name: 'Done' })).toHaveFocus()
    const figures = screen.getByRole('group', { name: 'What was added' })
    expect(figures).toHaveTextContent('added, private2')
    expect(figures).toHaveTextContent('already on the shelf1')
    expect(figures).toHaveTextContent('skipped, kept as drafts0')
    expect(figures).toHaveTextContent('photos that read nothing0')
    expect(api.calls('POST', /\/sittings\/s1\/commit$/)[0].body.today).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    )

    await user.click(screen.getByRole('button', { name: 'Publish these 2' }))
    await waitFor(() =>
      expect(api.calls('POST', /\/api\/items\/visibility$/)[0]?.body).toEqual({
        is_public: true,
        ids: ['item-e1', 'item-e2'],
      }),
    )
    expect(
      screen.getByRole('link', { name: 'See them on the shelf' }),
    ).toHaveAttribute('href', '/admin/collection')
  })

  it('shows each photo’s true state on a reload in Shoot (AC 4, 16)', async () => {
    fakeIntakeApi({
      budget: { remaining: 0, enforced: true },
      sittings: [
        longbox({
          photos: [
            photo('p1', 'read'),
            photo('p2', 'failed', { error: 'The model timed out' }),
            photo('p3', 'uploaded'),
            photo('p4', 'empty'),
          ],
        }),
      ],
    })
    renderSitting()
    const strip = await screen.findByRole('list', { name: 'Photos' })
    const tiles = within(strip).getAllByRole('listitem')
    expect(tiles[0]).toHaveTextContent('4 read')
    expect(tiles[1]).toHaveTextContent('failed')
    expect(tiles[1]).toHaveTextContent('The model timed out')
    expect(
      within(tiles[1]).getByRole('button', { name: 'Retry photo 2' }),
    ).toBeEnabled()
    expect(tiles[2]).toHaveTextContent('waiting for tomorrow’s budget')
    expect(tiles[3]).toHaveTextContent('nothing read')
    expect(document.body).toHaveTextContent(
      '1 photo waiting to be read: today’s model budget is used up',
    )
    expect(document.body).not.toHaveTextContent('did not answer')
  })

  it('refuses a wrong file by name, uploads each photo alone and reads it', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const api = fakeIntakeApi({
      sittings: [longbox({ photos: [], entries: [] })],
      reads: [
        () => ({
          status: 'read',
          entries: [
            entry('n1', 'exact', { chosen: candidate(9, 'Saga') }),
            entry('n2', 'check'),
          ],
        }),
      ],
    })
    renderSitting()
    expect(
      await screen.findByText(/About 1 model call per photo; 30 left today/),
    ).toBeInTheDocument()
    const start = screen.getByRole('button', { name: /Start checking/ })
    expect(start).toBeDisabled()
    await user.upload(screen.getByLabelText('Choose files'), [
      new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' }),
      new File(['jpeg'], 'box-1.jpg', { type: 'image/jpeg' }),
    ])
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'notes.pdf is application/pdf; upload JPEG, PNG, WebP or HEIC photos',
    )
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Photo 1 read, 2 titles',
      ),
    )
    expect(api.calls('POST', /\/sittings\/s1\/photos$/)).toHaveLength(1)
    expect(api.calls('POST', /\/read-next$/).length).toBeGreaterThanOrEqual(1)
    const strip = screen.getByRole('list', { name: 'Photos' })
    expect(within(strip).getByRole('listitem')).toHaveTextContent('2 read')
    expect(start).toBeEnabled()
  })

  it('says a photo waits for tomorrow when the budget runs out mid-sitting', async () => {
    const user = userEvent.setup()
    const api = fakeIntakeApi({
      sittings: [longbox({ photos: [], entries: [] })],
    })
    renderSitting()
    await screen.findByRole('heading', { name: 'Shoot' })
    api.state.budget.remaining = 0
    await user.upload(
      screen.getByLabelText('Choose files'),
      new File(['jpeg'], 'box-1.jpg', { type: 'image/jpeg' }),
    )
    const strip = await screen.findByRole('list', { name: 'Photos' })
    await waitFor(() =>
      expect(within(strip).getByRole('listitem')).toHaveTextContent(
        'waiting for tomorrow’s budget',
      ),
    )
  })

  it('retries one failed photo alone', async () => {
    const user = userEvent.setup()
    const api = fakeIntakeApi({
      sittings: [
        longbox({
          photos: [photo('p1', 'read'), photo('p2', 'failed', { error: 'x' })],
        }),
      ],
      reads: [() => ({ status: 'read', entries: [entry('n1', 'exact')] })],
    })
    renderSitting()
    await user.click(
      await screen.findByRole('button', { name: 'Retry photo 2' }),
    )
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Photo 2 read, 1 title',
      ),
    )
    expect(api.calls('POST', /\/photos\/p2\/retry$/)).toHaveLength(1)
  })

  it('opens at the step the sitting was left on (AC 3)', async () => {
    fakeIntakeApi({ sittings: [longbox({ step: 'details' })] })
    renderSitting()
    expect(
      await screen.findByRole('heading', { name: 'Details' }),
    ).toBeVisible()
    expect(currentStep()).toHaveTextContent('Details')
  })

  it('says how many issues joined series already on the shelf', async () => {
    const user = userEvent.setup()
    fakeIntakeApi({
      sittings: [longbox({ step: 'details' })],
      commit: () => ({
        status: 200,
        body: {
          added: 1,
          already_owned: 0,
          issues_added: 3,
          skipped_kept: 1,
          photos_empty: 0,
          photos_waiting: 0,
          refused: [],
          created: ['item-e2'],
        },
      }),
    })
    renderSitting()
    await user.click(
      await screen.findByRole('button', { name: 'Add 2 to the shelf' }),
    )
    await screen.findByRole('heading', { name: 'Done' })
    expect(
      screen.getByText('Added 3 issues to series already on the shelf.'),
    ).toBeInTheDocument()
  })

  it('lists comics adding to a series on the shelf, apart from the grid (AC 15)', async () => {
    const user = userEvent.setup()
    const saga = {
      item_id: 'saga-item',
      title: 'Saga',
      cover_url: null,
      owned: 57,
      owned_text: '1–57',
      released: 72,
      ongoing: true,
    }
    const { calls } = fakeIntakeApi({
      sittings: [
        longbox({
          step: 'check',
          entries: [
            entry('e5', 'owned', {
              chosen: candidate(9, 'Saga'),
              payload: { detected_title: 'SAGA 58', issues_owned: '58' },
              on_shelf: saga,
            }),
            entry('e6', 'owned', {
              chosen: candidate(9, 'Saga'),
              payload: { detected_title: 'SAGA 60', issues_owned: '60' },
              on_shelf: { ...saga, owned_text: '1–57, 60' },
            }),
            entry('e7', 'owned', {
              chosen: candidate(9, 'Saga'),
              payload: { detected_title: 'SAGA' },
              on_shelf: saga,
            }),
            entry('e3', 'exact', { chosen: candidate(4, 'East of West') }),
          ],
        }),
      ],
    })
    const { container } = renderSitting()
    expect(
      await screen.findByRole('heading', {
        name: 'Already on the shelf · adds issues · 3',
      }),
    ).toBeVisible()
    const [adds, owned, untyped] = within(
      container.querySelector('.intake-grow-list'),
    ).getAllByRole('listitem')
    expect(adds).toHaveTextContent('read from the photo: SAGA 58')
    expect(adds).toHaveTextContent('adds #58 · 57 of 72+ → 58 of 72+')
    expect(adds).toHaveTextContent('14 missing')
    expect(adds.querySelector('[data-k="new"]')).toHaveTextContent('+58')
    expect(
      within(adds).getByRole('checkbox', { name: 'Add to Saga' }),
    ).toBeChecked()
    expect(owned).toHaveTextContent(
      '#60 is already on the shelf · nothing to add',
    )
    expect(
      within(owned).getByRole('checkbox', { name: 'Add to Saga' }),
    ).toBeDisabled()
    expect(untyped).toHaveTextContent('No issues typed yet')
    // The grid keeps only titles new to the shelf.
    expect(screen.getByRole('heading', { name: /Matched · 1/ })).toBeVisible()

    // Edit issues types the numbers the photo cannot carry.
    await user.click(
      within(untyped).getByRole('button', { name: 'Edit issues of Saga' }),
    )
    const field = within(untyped).getByLabelText(
      'Issues of Saga in this sitting',
    )
    expect(field).toHaveFocus()
    await user.type(field, '59-60')
    await user.click(
      within(untyped).getByRole('button', { name: 'Save issues' }),
    )
    await waitFor(() =>
      expect(untyped).toHaveTextContent(
        'adds #59, #60 · 58 of 72+ → 60 of 72+',
      ),
    )
    const [save] = calls('PATCH', /\/api\/intake\/entries\/e7$/)
    expect(save.body.payload).toEqual({
      detected_title: 'SAGA',
      issues_owned: '59-60',
    })
    expect(
      within(untyped).getByRole('button', { name: 'Edit issues of Saga' }),
    ).toHaveFocus()

    // Unticking keeps the entry, as the grid does.
    await user.click(
      within(adds).getByRole('checkbox', { name: 'Add to Saga' }),
    )
    const [untick] = calls('PATCH', /\/api\/intake\/entries\/e5$/)
    expect(untick.body.state).toBe('ignored')
    expect(await axeViolations(container)).toEqual([])
  })

  it('lists the series that grew on Done, each linked (AC 16)', async () => {
    const user = userEvent.setup()
    fakeIntakeApi({
      sittings: [longbox({ step: 'details' })],
      commit: () => ({
        status: 200,
        body: {
          added: 1,
          already_owned: 0,
          issues_added: 3,
          series_grew: [
            {
              item_id: 'ww-item',
              title: 'Waterworld',
              is_public: true,
              cover_url: null,
              before: { owned: 2, released: 4 },
              ongoing: false,
              added: [3, 4],
              already: [],
              after_owned_text: '1–4',
            },
            {
              item_id: 'saga-item',
              title: 'Saga',
              is_public: false,
              cover_url: null,
              before: { owned: 57, released: 72 },
              ongoing: true,
              added: [58],
              already: [],
              after_owned_text: '1–58',
            },
            {
              item_id: 'saga-item-2',
              title: 'Saga again',
              cover_url: null,
              before: { owned: 58, released: 72 },
              ongoing: true,
              added: [],
              already: [60],
              after_owned_text: '1–58, 60',
            },
          ],
          skipped_kept: 0,
          photos_empty: 0,
          photos_waiting: 0,
          refused: [],
          created: ['item-e2'],
        },
      }),
    })
    const { container } = renderSitting()
    await user.click(
      await screen.findByRole('button', { name: 'Add 2 to the shelf' }),
    )
    await screen.findByRole('heading', { name: 'Done' })
    const tiles = screen.getByRole('group', { name: 'What was added' })
    expect(tiles).toHaveTextContent('series grew23 issues')
    expect(tiles).toHaveTextContent('issue already owned1')
    const list = container.querySelector('.intake-grow-list')
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(
      within(rows[0]).getByRole('link', { name: 'Waterworld' }),
    ).toHaveAttribute('href', '/shelf/ww-item/')
    expect(rows[0]).toHaveTextContent('adds #3, #4 · 2 of 4 → 4 of 4')
    expect(rows[0]).toHaveTextContent('Complete run')
    expect(rows[1]).toHaveTextContent('adds #58 · 57 of 72+ → 58 of 72+')
    // A private series has no public page yet: its admin page instead.
    expect(within(rows[1]).getByRole('link', { name: 'Saga' })).toHaveAttribute(
      'href',
      '/admin/collection/saga-item',
    )
    expect(within(list).queryByRole('checkbox')).toBeNull()
    expect(within(list).queryByRole('button')).toBeNull()
    expect(document.body).not.toHaveTextContent(/issues to series/)
    expect(await axeViolations(container)).toEqual([])
  })

  it('says nothing of issues when none joined a series', async () => {
    const user = userEvent.setup()
    fakeIntakeApi({ sittings: [longbox({ step: 'details' })] })
    renderSitting()
    await user.click(
      await screen.findByRole('button', { name: 'Add 2 to the shelf' }),
    )
    await screen.findByRole('heading', { name: 'Done' })
    expect(document.body).not.toHaveTextContent(/issues? to series/)
  })

  it("shows intake's own words for a 409, never the catalogue lock", async () => {
    const user = userEvent.setup()
    fakeIntakeApi({
      sittings: [longbox({ step: 'details' })],
      commit: () => ({
        status: 409,
        body: { detail: 'This sitting has already been added or discarded.' },
      }),
    })
    renderSitting()
    await user.click(
      await screen.findByRole('button', { name: 'Add 2 to the shelf' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This sitting has already been added or discarded.',
    )
    expect(document.body).not.toHaveTextContent('A refresh is already running')
  })

  it("puts the write path's refusal beside its field", async () => {
    const user = userEvent.setup()
    fakeIntakeApi({
      sittings: [longbox({ step: 'details' })],
      commit: () => ({
        status: 422,
        body: {
          added: 0,
          refused: [
            {
              entry_id: 'e2',
              field: 'issues_owned',
              message: 'Issue 0 is not a range',
            },
          ],
          detail: '1 to fix before anything is added',
        },
      }),
    })
    renderSitting()
    await user.click(
      await screen.findByRole('button', { name: 'Add 2 to the shelf' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '1 to fix before anything is added',
    )
    const saga = screen.getByRole('group', { name: 'Saga' })
    expect(
      within(saga).getByLabelText('Issues owned'),
    ).toHaveAccessibleDescription('Issue 0 is not a range')
    expect(screen.queryByRole('heading', { name: 'Done' })).toBeNull()
  })

  describe('collected editions in Details', () => {
    const tradeSitting = () =>
      longbox({
        step: 'details',
        entries: [
          entry('e2', 'ready', {
            photo_id: 'p1',
            chosen: candidate(3, 'Saga'),
            payload: { shelf_format: 'trades' },
          }),
          entry('e3', 'ready', {
            photo_id: 'p1',
            chosen: candidate(4, 'East of West'),
            payload: { shelf_format: 'singles' },
          }),
        ],
      })

    it('offers editions on a trades row only, and saves them with the payload', async () => {
      const user = userEvent.setup()
      const api = fakeIntakeApi({ sittings: [tradeSitting()] })
      renderSitting()
      const saga = await screen.findByRole('group', { name: 'Saga' })
      expect(
        within(screen.getByRole('group', { name: 'East of West' })).queryByText(
          'Collected editions',
        ),
      ).toBeNull()
      await user.click(
        within(saga).getByRole('button', { name: 'Add an edition' }),
      )
      await user.type(within(saga).getByLabelText('Label, edition 1'), 'Vol. 1')
      // The row is named by its label once it has one.
      await user.type(within(saga).getByLabelText('Kind, Vol. 1'), 'Trade')
      await user.type(within(saga).getByLabelText('From issue, Vol. 1'), '1')
      await user.type(within(saga).getByLabelText('To issue, Vol. 1'), '6')
      await user.click(document.body) // focus leaves the editions
      await waitFor(() =>
        expect(api.calls('PATCH', /\/entries\/e2$/).at(-1)?.body).toEqual({
          payload: {
            shelf_format: 'trades',
            editions: [{ kind: 'Trade', label: 'Vol. 1', from: 1, to: 6 }],
          },
        }),
      )
    })

    it('says so beside the row when an edition is half filled, and saves nothing', async () => {
      const user = userEvent.setup()
      const api = fakeIntakeApi({ sittings: [tradeSitting()] })
      renderSitting()
      const saga = await screen.findByRole('group', { name: 'Saga' })
      await user.click(
        within(saga).getByRole('button', { name: 'Add an edition' }),
      )
      await user.type(within(saga).getByLabelText('Kind, edition 1'), 'Trade')
      await user.click(document.body) // focus leaves the editions
      expect(await within(saga).findByRole('alert')).toHaveTextContent(
        'Edition 1',
      )
      expect(api.calls('PATCH', /\/entries\/e2$/)).toHaveLength(0)
    })

    it("puts the write path's refusal beside the editions", async () => {
      const user = userEvent.setup()
      fakeIntakeApi({
        sittings: [tradeSitting()],
        commit: () => ({
          status: 422,
          body: {
            added: 0,
            refused: [
              {
                entry_id: 'e2',
                field: 'editions',
                message: 'edition runs backwards',
              },
            ],
            detail: '1 to fix before anything is added',
          },
        }),
      })
      renderSitting()
      await user.click(
        await screen.findByRole('button', { name: 'Add 2 to the shelf' }),
      )
      const saga = screen.getByRole('group', { name: 'Saga' })
      expect(
        await within(saga).findByText('edition runs backwards'),
      ).toBeInTheDocument()
      expect(saga).toHaveTextContent('Collected editions')
    })

    it('does not add while an edition on any row is half filled', async () => {
      const user = userEvent.setup()
      const api = fakeIntakeApi({ sittings: [tradeSitting()] })
      renderSitting()
      const saga = await screen.findByRole('group', { name: 'Saga' })
      await user.click(
        within(saga).getByRole('button', { name: 'Add an edition' }),
      )
      await user.type(within(saga).getByLabelText('Kind, edition 1'), 'Trade')
      await user.click(
        screen.getByRole('button', { name: 'Add 2 to the shelf' }),
      )
      expect(await within(saga).findByRole('alert')).toHaveTextContent(
        'Edition 1',
      )
      expect(api.calls('POST', /\/commit$/)).toHaveLength(0)
      expect(api.calls('PATCH', /\/entries\/e2$/)).toHaveLength(0)
      expect(saga.contains(document.activeElement)).toBe(true)
    })

    it('clears the stale refusal once the owner edits the editions', async () => {
      const user = userEvent.setup()
      fakeIntakeApi({
        sittings: [tradeSitting()],
        commit: () => ({
          status: 422,
          body: {
            added: 0,
            refused: [
              {
                entry_id: 'e2',
                field: 'editions',
                message: 'edition runs backwards',
              },
            ],
            detail: '1 to fix before anything is added',
          },
        }),
      })
      renderSitting()
      await user.click(
        await screen.findByRole('button', { name: 'Add 2 to the shelf' }),
      )
      const saga = screen.getByRole('group', { name: 'Saga' })
      await within(saga).findByText('edition runs backwards')
      await user.click(
        within(saga).getByRole('button', { name: 'Add an edition' }),
      )
      await user.type(within(saga).getByLabelText('Label, edition 1'), 'Vol. 1')
      await user.type(within(saga).getByLabelText('Kind, Vol. 1'), 'Trade')
      await user.type(within(saga).getByLabelText('From issue, Vol. 1'), '1')
      await user.type(within(saga).getByLabelText('To issue, Vol. 1'), '6')
      await user.click(document.body)
      await waitFor(() =>
        expect(within(saga).queryByText('edition runs backwards')).toBeNull(),
      )
    })

    it('keeps both a just-saved edition and the Issues field saved after it', async () => {
      const user = userEvent.setup()
      const api = fakeIntakeApi({ sittings: [tradeSitting()] })
      // The first PATCH answers only when released, as a slow network would.
      const real = api.fetch
      let release
      const gate = new Promise((resolve) => (release = resolve))
      let patches = 0
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url, options = {}) => {
          const answer = await real(url, options)
          if (options.method === 'PATCH' && /\/entries\/e2$/.test(url)) {
            if (++patches === 1) await gate
          }
          return answer
        }),
      )
      renderSitting()
      const saga = await screen.findByRole('group', { name: 'Saga' })
      await user.click(
        within(saga).getByRole('button', { name: 'Add an edition' }),
      )
      await user.type(within(saga).getByLabelText('Label, edition 1'), 'Vol. 1')
      await user.type(within(saga).getByLabelText('Kind, Vol. 1'), 'Trade')
      await user.type(within(saga).getByLabelText('From issue, Vol. 1'), '1')
      await user.type(within(saga).getByLabelText('To issue, Vol. 1'), '6')
      await user.click(within(saga).getByLabelText('Issues owned'))
      await user.type(within(saga).getByLabelText('Issues owned'), '7')
      await user.click(document.body)
      await waitFor(() =>
        expect(api.calls('PATCH', /\/entries\/e2$/)).toHaveLength(2),
      )
      release()
      await waitFor(() =>
        expect(api.calls('PATCH', /\/entries\/e2$/).at(-1)?.body).toEqual({
          payload: {
            shelf_format: 'trades',
            editions: [{ kind: 'Trade', label: 'Vol. 1', from: 1, to: 6 }],
            issues_owned: '7',
          },
        }),
      )
    })
  })

  it.each(['shoot', 'check', 'details'])('passes axe on %s', async (step) => {
    fakeIntakeApi({ sittings: [longbox({ step })] })
    const { container } = renderSitting()
    await screen.findByRole('list', { name: 'Steps' })
    await screen.findByRole('heading', { level: 2 })
    expect(await axeViolations(container)).toEqual([])
  })

  it('passes axe on Done', async () => {
    const user = userEvent.setup()
    fakeIntakeApi({ sittings: [longbox({ step: 'details' })] })
    const { container } = renderSitting()
    await user.click(
      await screen.findByRole('button', { name: 'Add 2 to the shelf' }),
    )
    await screen.findByRole('heading', { name: 'Done' })
    expect(await axeViolations(container)).toEqual([])
  })

  it('starts the next box fresh, with none of the last one’s state', async () => {
    const user = userEvent.setup()
    const api = fakeIntakeApi({ sittings: [longbox({ step: 'details' })] })
    renderSitting()
    await user.click(
      await screen.findByRole('button', { name: 'Add 2 to the shelf' }),
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Longbox 1 is in' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Shoot the next box' }))
    expect(await screen.findByRole('heading', { name: 'Shoot' })).toBeVisible()
    expect(api.calls('GET', /\/sittings\/new-1$/)).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /^Sitting$/,
    )
    expect(document.title).not.toMatch(/is in/)
    expect(currentStep()).toHaveTextContent('Shoot')
  })

  /** Holds every read-next until `release()`, so a test can move meanwhile. */
  function holdReads(api) {
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const inner = api.fetch.getMockImplementation()
    api.fetch.mockImplementation(async (url, options) => {
      if (/\/read-next$/.test(String(url))) await gate
      return inner(url, options)
    })
    return () => release()
  }

  /** Read-nexts asked for, held or not (the fake logs only answered ones). */
  const readsAsked = (api) =>
    api.fetch.mock.calls.filter(([url]) => /\/read-next$/.test(String(url)))
      .length

  it('keeps reading after Start checking, and Check shows what lands', async () => {
    const user = userEvent.setup()
    const api = fakeIntakeApi({
      sittings: [
        longbox({ photos: [photo('p1', 'read'), photo('p2', 'uploaded')] }),
      ],
      reads: [
        () => ({
          status: 'read',
          entries: [entry('n1', 'exact', { chosen: candidate(9, 'Hellboy') })],
        }),
      ],
    })
    const release = holdReads(api)
    renderSitting()
    await user.click(
      await screen.findByRole('button', { name: /Start checking/ }),
    )
    expect(await screen.findByRole('heading', { name: 'Check' })).toBeVisible()
    await waitFor(() => expect(readsAsked(api)).toBe(1))
    release()
    expect(
      await screen.findByRole('checkbox', { name: 'Hellboy' }),
    ).toBeChecked()
    expect(screen.getByRole('heading', { name: 'Check' })).toBeVisible()
  })

  it('goes back to Shoot from Check, saving the step', async () => {
    const user = userEvent.setup()
    const api = fakeIntakeApi({ sittings: [longbox({ step: 'check' })] })
    renderSitting()
    await press(user, await screen.findByRole('button', { name: /Shoot more/ }))
    expect(await screen.findByRole('heading', { name: 'Shoot' })).toHaveFocus()
    expect(currentStep()).toHaveTextContent('Shoot')
    expect(api.calls('PATCH', /\/sittings\/s1$/).at(-1).body).toEqual({
      step: 'shoot',
    })
  })

  it('goes back to Check from Details, saving the step', async () => {
    const user = userEvent.setup()
    const api = fakeIntakeApi({ sittings: [longbox({ step: 'details' })] })
    renderSitting()
    await press(
      user,
      await screen.findByRole('button', { name: /Back to Check/ }),
    )
    expect(await screen.findByRole('heading', { name: 'Check' })).toHaveFocus()
    expect(currentStep()).toHaveTextContent('Check')
    expect(api.calls('PATCH', /\/sittings\/s1$/).at(-1).body).toEqual({
      step: 'check',
    })
  })

  it('stops reading when the page goes, with no read after it', async () => {
    const api = fakeIntakeApi({
      sittings: [
        longbox({
          photos: [
            photo('p1', 'read'),
            photo('p2', 'uploaded'),
            photo('p3', 'uploaded'),
          ],
        }),
      ],
      reads: [
        () => ({ status: 'read', entries: [entry('n1', 'exact')] }),
        () => ({ status: 'read', entries: [entry('n2', 'exact')] }),
      ],
    })
    const release = holdReads(api)
    const { unmount } = renderSitting()
    await waitFor(() => expect(readsAsked(api)).toBe(1))
    unmount()
    release()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(readsAsked(api)).toBe(1)
  })

  it('takes a closet sitting from Shoot to Done with no Details step', async () => {
    const user = userEvent.setup()
    const api = fakeIntakeApi({
      sittings: [{ id: 'c1', area: 'closet', kind: 'garment', label: 'Rack' }],
    })
    renderSitting('c1', 'closet')
    await screen.findByRole('heading', { name: 'Shoot' })
    expect(
      within(steps())
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['1 · Shoot', '2 · Check', '3 · Done'])
    await user.upload(
      screen.getByLabelText('Choose files'),
      new File(['jpeg'], 'shirt.jpg', { type: 'image/jpeg' }),
    )
    await user.click(
      await screen.findByRole('button', { name: /Start checking/ }),
    )
    await user.click(
      await screen.findByRole('button', { name: 'Add 1 to the closet' }),
    )
    expect(await screen.findByRole('heading', { name: 'Done' })).toBeVisible()
    expect(api.calls('POST', /\/read-next$/)).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /Publish/ })).toBeNull()
  })

  it('asks about a given-up piece in Clothes · Check and removes its photo', async () => {
    const user = userEvent.setup()
    const api = fakeIntakeApi({
      sittings: [
        {
          id: 'c2',
          area: 'closet',
          kind: 'garment',
          label: 'Rack',
          step: 'check',
          entries: [
            entry('ge1', 'ready', { kind: 'garment', garment_id: 'gx' }),
          ],
        },
      ],
      garments: [
        {
          id: 'gx',
          name: 'Oxford shirt',
          status: 'untagged',
          tag_source: null,
          tag_attempts: 3,
          image: null,
        },
      ],
    })
    renderSitting('c2', 'closet')
    expect(
      await screen.findByRole('button', { name: 'Save and next' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove this photo' }))
    await user.click(screen.getByRole('button', { name: 'Yes, remove' }))
    await waitFor(() =>
      expect(api.calls('DELETE', /\/api\/closet\/garments\/gx$/)).toHaveLength(
        1,
      ),
    )
    expect(
      await screen.findByText(/Nothing left to check one at a time/),
    ).toBeInTheDocument()
  })

  it('adds a searched title to the sitting from Shoot (Search instead)', async () => {
    const user = userEvent.setup()
    const saga = {
      ...candidate(7, 'Saga', 2012),
      kind: 'comic',
      owned_item_id: null,
    }
    const api = fakeIntakeApi({
      sittings: [longbox({ photos: [], entries: [] })],
      search: () => ({
        results: [saga],
        sources: [{ kind: 'comic', state: 'ok', reason: null }],
      }),
    })
    const { container } = renderSitting()
    await screen.findByRole('heading', { name: 'Shoot' })
    await user.click(screen.getByRole('button', { name: 'Search instead' }))
    await user.type(
      screen.getByRole('searchbox', { name: 'Search for a title' }),
      'Saga{Enter}',
    )
    await user.click(await screen.findByRole('button', { name: 'Add Saga' }))
    await waitFor(() =>
      expect(screen.getByText('1 title so far · 1 ready')).toBeInTheDocument(),
    )
    const [added] = api.calls('POST', /\/sittings\/s1\/entries$/)
    expect(added.body).toEqual({ kind: 'comic', chosen: saga })
    expect(api.state.sittings.s1.entries).toHaveLength(1)
    expect(
      screen.getByText('Saga added to this sitting.').closest('[role=status]'),
    ).not.toBeNull()
    expect(screen.getByRole('button', { name: /Start checking/ })).toBeEnabled()
    expect(await axeViolations(container)).toEqual([])
  })

  it('shows Added, not a second Add, for a result already in the sitting; removing it offers Add again', async () => {
    const user = userEvent.setup()
    const saga = {
      ...candidate(7, 'Saga', 2012),
      kind: 'comic',
      owned_item_id: null,
    }
    const api = fakeIntakeApi({
      sittings: [longbox({ photos: [], entries: [] })],
      search: () => ({
        results: [saga],
        sources: [{ kind: 'comic', state: 'ok', reason: null }],
      }),
    })
    renderSitting()
    await screen.findByRole('heading', { name: 'Shoot' })
    await user.click(screen.getByRole('button', { name: 'Search instead' }))
    await user.type(
      screen.getByRole('searchbox', { name: 'Search for a title' }),
      'Saga{Enter}',
    )
    await user.click(await screen.findByRole('button', { name: 'Add Saga' }))
    const added = await screen.findByRole('button', { name: 'Added: Saga' })
    expect(added).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Add Saga' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Remove Saga/ }))
    await user.click(await screen.findByRole('button', { name: 'Add Saga' }))
    expect(api.calls('POST', /\/sittings\/s1\/entries$/)).toHaveLength(2)
  })

  it('offers Add, not Added, for a guess still to check and for an unticked title', async () => {
    const user = userEvent.setup()
    const saga = {
      ...candidate(7, 'Saga', 2012),
      kind: 'comic',
      owned_item_id: null,
    }
    const zine = {
      ...candidate(8, 'Zine', 2015),
      kind: 'comic',
      owned_item_id: null,
    }
    fakeIntakeApi({
      sittings: [
        longbox({
          photos: [],
          entries: [
            entry('c1', 'probable', { kind: 'comic', chosen: saga }),
            entry('u1', 'ignored', {
              kind: 'comic',
              chosen: zine,
              payload: { unticked: true, was: 'exact' },
            }),
          ],
        }),
      ],
      search: () => ({
        results: [saga, zine],
        sources: [{ kind: 'comic', state: 'ok', reason: null }],
      }),
    })
    renderSitting()
    await screen.findByRole('heading', { name: 'Shoot' })
    await user.click(screen.getByRole('button', { name: 'Search instead' }))
    await user.type(
      screen.getByRole('searchbox', { name: 'Search for a title' }),
      'Saga{Enter}',
    )
    expect(
      await screen.findByRole('button', { name: 'Add Saga' }),
    ).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Add Zine' })).toBeEnabled()
  })

  it('shows Added for a result already in the sitting when the search is reopened', async () => {
    const user = userEvent.setup()
    const saga = {
      ...candidate(7, 'Saga', 2012),
      kind: 'comic',
      owned_item_id: null,
    }
    fakeIntakeApi({
      sittings: [
        longbox({
          photos: [],
          entries: [entry('t1', 'ready', { kind: 'comic', chosen: saga })],
        }),
      ],
      search: () => ({
        results: [saga],
        sources: [{ kind: 'comic', state: 'ok', reason: null }],
      }),
    })
    renderSitting()
    await screen.findByRole('heading', { name: 'Shoot' })
    await user.click(screen.getByRole('button', { name: 'Search instead' }))
    await user.type(
      screen.getByRole('searchbox', { name: 'Search for a title' }),
      'Saga{Enter}',
    )
    expect(
      await screen.findByRole('button', { name: 'Added: Saga' }),
    ).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Add Saga' })).toBeNull()
  })

  it('keeps a searched title as typed from Shoot', async () => {
    const user = userEvent.setup()
    const api = fakeIntakeApi({
      sittings: [longbox({ photos: [], entries: [] })],
    })
    renderSitting()
    await screen.findByRole('heading', { name: 'Shoot' })
    await user.click(screen.getByRole('button', { name: 'Search instead' }))
    await user.type(
      screen.getByRole('searchbox', { name: 'Search for a title' }),
      'Lost zine{Enter}',
    )
    await user.click(
      await screen.findByRole('button', { name: 'Keep as a typed Comic' }),
    )
    await waitFor(() =>
      expect(api.calls('POST', /\/sittings\/s1\/entries$/)).toHaveLength(1),
    )
    expect(api.calls('POST', /\/sittings\/s1\/entries$/)[0].body).toEqual({
      kind: 'comic',
      payload: { title: 'Lost zine' },
    })
    expect(
      await screen.findByText('1 title so far · 1 ready'),
    ).toBeInTheDocument()
  })

  it('offers no Search instead in a closet sitting', async () => {
    fakeIntakeApi({
      sittings: [{ id: 'c1', area: 'closet', kind: 'garment', label: 'Rack' }],
    })
    renderSitting('c1', 'closet')
    await screen.findByRole('heading', { name: 'Shoot' })
    expect(screen.queryByRole('button', { name: 'Search instead' })).toBeNull()
  })

  describe('removing a title or photo before it is added (#157)', () => {
    it('removes a photo from Shoot with the titles read from it', async () => {
      const user = userEvent.setup()
      const api = fakeIntakeApi({
        sittings: [longbox({ step: 'shoot' })],
      })
      renderSitting()
      await screen.findByRole('heading', { name: 'Shoot' })
      expect(
        screen.getByText(
          '4 titles so far · 2 ready · 1 to check · 1 on the shelf',
        ),
      ).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Remove photo 1' }))
      await waitFor(() =>
        expect(api.calls('DELETE', /\/sittings\/s1\/photos\/p1$/)).toHaveLength(
          1,
        ),
      )
      expect(await screen.findByText('0 titles so far')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Remove photo 1' }),
      ).not.toBeInTheDocument()
    })

    it("does not bring a removed photo back when another photo's read lands late", async () => {
      const user = userEvent.setup()
      const api = fakeIntakeApi({
        sittings: [
          longbox({
            step: 'shoot',
            photos: [photo('p1', 'uploaded'), photo('p2', 'uploaded')],
            entries: [],
          }),
        ],
        reads: [
          () => ({
            status: 'read',
            entries: [
              entry('n1', 'exact', { chosen: candidate(9, 'Hellboy') }),
            ],
          }),
        ],
      })
      // The read is computed at once but answered only on release.
      let release
      const gate = new Promise((resolve) => {
        release = resolve
      })
      const inner = api.fetch.getMockImplementation()
      api.fetch.mockImplementation(async (url, options) => {
        const answer = await inner(url, options)
        if (/\/read-next$/.test(String(url))) await gate
        return answer
      })
      renderSitting()
      await screen.findByRole('heading', { name: 'Shoot' })
      await waitFor(() => expect(readsAsked(api)).toBe(1))
      // p1 is the photo in flight: it cannot be removed, p2 can.
      expect(
        screen.getByRole('button', { name: 'Remove photo 1' }),
      ).toBeDisabled()
      await user.click(screen.getByRole('button', { name: 'Remove photo 2' }))
      await waitFor(() =>
        expect(api.calls('DELETE', /\/photos\/p2$/)).toHaveLength(1),
      )
      release()
      expect(await screen.findByText(/^1 title so far/)).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Remove photo 2' }),
      ).not.toBeInTheDocument()
    })

    it("still shows the server's 409 when it refuses a removal", async () => {
      const user = userEvent.setup()
      const api = fakeIntakeApi({
        sittings: [
          longbox({
            step: 'shoot',
            photos: [photo('p1', 'read'), photo('p2', 'uploaded')],
            entries: [],
          }),
        ],
      })
      const inner = api.fetch.getMockImplementation()
      api.fetch.mockImplementation(async (url, options) =>
        options?.method === 'DELETE' && /\/photos\/p2$/.test(String(url))
          ? {
              ok: false,
              status: 409,
              json: async () => ({ detail: 'That photo is being read.' }),
            }
          : inner(url, options),
      )
      renderSitting()
      await screen.findByRole('heading', { name: 'Shoot' })
      await user.click(screen.getByRole('button', { name: 'Remove photo 2' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'That photo is being read.',
      )
    })

    it('says so when the sitting is gone, and keeps the photo shown', async () => {
      const user = userEvent.setup()
      const api = fakeIntakeApi({ sittings: [longbox({ step: 'shoot' })] })
      renderSitting()
      await screen.findByRole('heading', { name: 'Shoot' })
      delete api.state.sittings.s1
      await user.click(screen.getByRole('button', { name: 'Remove photo 1' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'already been added or discarded',
      )
      expect(
        screen.getByRole('button', { name: 'Remove photo 1' }),
      ).toBeInTheDocument()
    })

    it('removes a searched or typed title from Shoot without writing it', async () => {
      const user = userEvent.setup()
      const api = fakeIntakeApi({
        sittings: [
          longbox({
            step: 'shoot',
            photos: [],
            entries: [
              entry('t1', 'typed', {
                payload: { title: 'Lost zine' },
              }),
            ],
          }),
        ],
      })
      renderSitting()
      await screen.findByRole('heading', { name: 'Shoot' })
      await user.click(screen.getByRole('button', { name: 'Remove Lost zine' }))
      await waitFor(() =>
        expect(api.calls('PATCH', /\/entries\/t1$/)).toHaveLength(1),
      )
      const { body } = api.calls('PATCH', /\/entries\/t1$/)[0]
      expect(body.state).toBe('ignored')
      expect(body.payload?.unticked).toBeUndefined()
      expect(await screen.findByText('0 titles so far')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Remove Lost zine' }),
      ).not.toBeInTheDocument()
    })

    it('removes a typed closet piece from Shoot with its garment', async () => {
      const user = userEvent.setup()
      const api = fakeIntakeApi({
        sittings: [
          {
            id: 'c3',
            area: 'closet',
            kind: 'garment',
            label: 'Rack',
            step: 'shoot',
            entries: [
              entry('ge1', 'typed', {
                kind: 'garment',
                garment_id: 'gx',
                payload: { name: 'Grey coat' },
              }),
            ],
          },
        ],
        garments: [{ id: 'gx', name: 'Grey coat', status: 'active' }],
      })
      renderSitting('c3', 'closet')
      await user.click(
        await screen.findByRole('button', { name: 'Remove Grey coat' }),
      )
      await waitFor(() =>
        expect(
          api.calls('DELETE', /\/api\/closet\/garments\/gx$/),
        ).toHaveLength(1),
      )
      expect(api.calls('PATCH', /\/entries\//)).toHaveLength(0)
      await waitFor(() =>
        expect(
          screen.queryByRole('button', { name: 'Remove Grey coat' }),
        ).not.toBeInTheDocument(),
      )
    })

    it('removes a title from the Check skim grid', async () => {
      const user = userEvent.setup()
      const api = fakeIntakeApi({ sittings: [longbox({ step: 'check' })] })
      renderSitting()
      await screen.findByRole('heading', { name: 'Check' })
      await user.click(screen.getByRole('button', { name: 'Remove Saga' }))
      await waitFor(() =>
        expect(api.calls('PATCH', /\/entries\/e2$/)).toHaveLength(1),
      )
      expect(api.calls('PATCH', /\/entries\/e2$/)[0].body).toEqual({
        state: 'ignored',
        payload: {},
      })
      await waitFor(() =>
        expect(
          screen.queryByRole('checkbox', { name: /Saga/ }),
        ).not.toBeInTheDocument(),
      )
      expect(
        screen.getByRole('checkbox', { name: /East of West/ }),
      ).toBeInTheDocument()
    })

    it('removes a title from Details', async () => {
      const user = userEvent.setup()
      const api = fakeIntakeApi({ sittings: [longbox({ step: 'details' })] })
      renderSitting()
      await screen.findByRole('heading', { name: 'Details' })
      await user.click(screen.getByRole('button', { name: 'Remove Saga' }))
      await waitFor(() =>
        expect(api.calls('PATCH', /\/entries\/e2$/)).toHaveLength(1),
      )
      expect(
        await screen.findByRole('button', { name: /Add 1 to/ }),
      ).toBeEnabled()
      expect(
        screen.queryByRole('group', { name: 'Saga' }),
      ).not.toBeInTheDocument()
    })
  })
})

describe('AdminSitting waits (#160)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  /** Opens a sitting whose read-next never answers. */
  async function openWithHungReads(photos) {
    const api = fakeIntakeApi({ sittings: [longbox({ photos })] })
    const inner = api.fetch.getMockImplementation()
    api.fetch.mockImplementation((url, options) =>
      /\/read-next$/.test(String(url))
        ? new Promise(() => {})
        : inner(url, options),
    )
    renderSitting()
    // Let the sitting load, then the reader start by itself.
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10)
      })
    }
    return api
  }

  it('tells the photo in flight from the ones queued behind it', async () => {
    await openWithHungReads([
      photo('p1', 'read'),
      photo('p2', 'uploaded'),
      photo('p3', 'uploaded'),
      photo('p4', 'uploaded'),
    ])
    const tiles = within(
      screen.getByRole('list', { name: 'Photos' }),
    ).getAllByRole('listitem')
    expect(within(tiles[1]).getByText('reading · 0 s')).toBeVisible()
    expect(
      within(tiles[2]).getByText('waiting to be read · next'),
    ).toBeVisible()
    expect(
      within(tiles[3]).getByText('waiting to be read · 1 ahead'),
    ).toBeVisible()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(within(tiles[1]).getByText('reading · 5 s')).toBeVisible()
  })

  it('stops the reader with a message when read-next passes the deadline', async () => {
    const api = await openWithHungReads([photo('p1', 'uploaded')])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(195_000)
    })
    expect(screen.getByRole('alert')).toHaveTextContent(
      "The reader didn't answer in time; try again.",
    )
    const asked = api.fetch.mock.calls.filter(([url]) =>
      /\/read-next$/.test(String(url)),
    ).length
    expect(asked).toBe(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(
      api.fetch.mock.calls.filter(([url]) => /\/read-next$/.test(String(url))),
    ).toHaveLength(1)
  })

  const readsOf = (api) =>
    api.fetch.mock.calls.filter(([url]) => /\/read-next$/.test(String(url)))
      .length
  const sittingGets = (api) =>
    api.fetch.mock.calls.filter(
      ([url, options]) =>
        /\/api\/intake\/sittings\/s1$/.test(String(url)) &&
        (options?.method ?? 'GET') === 'GET',
    ).length

  it('re-fetches the sitting after a deadline, so tiles show the server state', async () => {
    const api = await openWithHungReads([
      photo('p1', 'uploaded'),
      photo('p2', 'uploaded'),
    ])
    const before = sittingGets(api)
    // The server finished p1 while the answer was lost.
    api.state.sittings.s1.photos[0].state = 'read'
    await act(async () => {
      await vi.advanceTimersByTimeAsync(195_000)
    })
    expect(sittingGets(api)).toBe(before + 1)
    const tiles = within(
      screen.getByRole('list', { name: 'Photos' }),
    ).getAllByRole('listitem')
    expect(within(tiles[0]).getByText('4 read')).toBeVisible()
    // Nothing is marked reading that the server did not claim.
    expect(screen.queryByText(/^reading/)).not.toBeInTheDocument()
    expect(
      within(tiles[1]).getByText('waiting to be read · next'),
    ).toBeVisible()
  })

  /** Makes every later GET of the sitting wait for `release()`, or forever. */
  function holdSittingGets(api) {
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const inner = api.fetch.getMockImplementation()
    api.fetch.mockImplementation(async (url, options) => {
      if (
        /\/api\/intake\/sittings\/s1$/.test(String(url)) &&
        (options?.method ?? 'GET') === 'GET'
      ) {
        await gate
      }
      return inner(url, options)
    })
    return release
  }

  it('offers Read again only once the re-fetch has settled, and it then reads', async () => {
    const api = await openWithHungReads([photo('p1', 'uploaded')])
    const release = holdSittingGets(api)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(195_000)
    })
    expect(screen.getByRole('alert')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Read again' }),
    ).not.toBeInTheDocument()
    await act(async () => {
      release()
      await vi.advanceTimersByTimeAsync(10)
    })
    await act(async () => {
      screen.getByRole('button', { name: 'Read again' }).click()
    })
    expect(readsOf(api)).toBe(2)
  })

  it('still offers a working Read again when the re-fetch never answers', async () => {
    const api = await openWithHungReads([photo('p1', 'uploaded')])
    holdSittingGets(api)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(195_000)
    })
    expect(
      screen.queryByRole('button', { name: 'Read again' }),
    ).not.toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    await act(async () => {
      screen.getByRole('button', { name: 'Read again' }).click()
    })
    expect(readsOf(api)).toBe(2)
  })

  it('offers Read again after a deadline, which clears the error and reads again', async () => {
    const api = await openWithHungReads([photo('p1', 'uploaded')])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(195_000)
    })
    expect(readsOf(api)).toBe(1)
    const alert = screen.getByRole('alert')
    expect(
      within(alert.parentElement).getByRole('button', { name: 'Read again' }),
    ).toBeVisible()
    await act(async () => {
      screen.getByRole('button', { name: 'Read again' }).click()
    })
    expect(readsOf(api)).toBe(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Read again' }),
    ).not.toBeInTheDocument()
  })

  it('does not offer Read again for an error the reader did not raise', async () => {
    await openWithHungReads([photo('p1', 'failed', { error: 'bad' })])
    expect(
      screen.queryByRole('button', { name: 'Read again' }),
    ).not.toBeInTheDocument()
  })

  it('disables Remove on the photo being read, not on those queued', async () => {
    await openWithHungReads([photo('p1', 'uploaded'), photo('p2', 'uploaded')])
    expect(
      screen.getByRole('button', { name: 'Remove photo 1' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove photo 2' })).toBeEnabled()
  })

  it('tells the visitor photos are read one at a time, oldest first', async () => {
    await openWithHungReads([photo('p1', 'read')])
    expect(
      screen.getByText(
        /Keep shooting: photos are read one at a time, oldest first\./,
      ),
    ).toBeVisible()
  })
})
