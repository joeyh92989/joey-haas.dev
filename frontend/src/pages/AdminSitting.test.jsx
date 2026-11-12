import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it('keeps reading entries in the total and counts unread photos apart', async () => {
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
        '2 titles so far · 1 ready · 1 reading · 2 photos waiting to be read',
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
      within(group).getByRole('radio', { name: /^The Sandman 1989/ }),
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
