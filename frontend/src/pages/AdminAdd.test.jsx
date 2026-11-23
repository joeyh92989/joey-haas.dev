import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import { entry, fakeIntakeApi, KINDS, photo } from '../lib/intake.test-util.js'
import AdminAdd from './AdminAdd.jsx'
import { adminCopy } from '../content/adminCopy.js'

function Sitting() {
  return <p data-testid="sitting">{useParams().sittingId}</p>
}

function NewBatch() {
  return <p data-testid="new-batch">{useParams().kind}</p>
}

function renderAt(path = '/admin/collection/add') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/collection/add" element={<AdminAdd />} />
        <Route path="/admin/closet/add" element={<AdminAdd />} />
        <Route path="/admin/collection/add/new/:kind" element={<NewBatch />} />
        <Route path="/admin/closet/add/new/:kind" element={<NewBatch />} />
        <Route path="/admin/collection/add/:sittingId" element={<Sitting />} />
        <Route path="/admin/closet/add/:sittingId" element={<Sitting />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const LONGBOX = {
  id: 's1',
  area: 'shelf',
  kind: 'comic',
  label: 'Longbox 1',
  photos: [photo('p1', 'read'), photo('p2', 'uploaded')],
  entries: [entry('e1', 'exact'), entry('e2', 'check')],
}

describe('AdminAdd', () => {
  it('builds a tile per kind of the area, with the ways in each declared', async () => {
    fakeIntakeApi()
    renderAt()
    const tiles = await screen.findByRole('group', {
      name: adminCopy.add.startSitting,
    })
    const names = within(tiles)
      .getAllByRole('button')
      .map((tile) => tile.querySelector('.intake-kind-name').textContent)
    // Movie and Board game have no list in the Shelf nav, so Add leaves
    // them out (#493).
    expect(names).toEqual(['Game', 'Comic', 'Mixed shelf'])
    expect(screen.getByText('Nothing unfinished')).toBeInTheDocument()
  })

  it('shows a kind registered on the server with no change here (AC 9)', async () => {
    const vinyl = {
      key: 'vinyl',
      area: 'shelf',
      label: 'Record',
      ways_in: ['photo', 'type'],
      has_details: true,
      source_state: 'ready',
      fields: [],
    }
    const api = fakeIntakeApi()
    const real = api.fetch.getMockImplementation()
    api.fetch.mockImplementation(async (url, options) =>
      String(url).endsWith('/api/intake/kinds')
        ? { ok: true, status: 200, json: async () => [...KINDS, vinyl] }
        : real(url, options),
    )
    renderAt()
    expect(
      await screen.findByRole('button', { name: /Record.*photo · type/ }),
    ).toBeEnabled()
  })

  it('opens the new-batch page for a card and saves nothing yet', async () => {
    const api = fakeIntakeApi()
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: /^Comic/ }))
    expect(await screen.findByTestId('new-batch')).toHaveTextContent('comic')
    expect(api.calls('POST', /\/api\/intake\/sittings$/)).toHaveLength(0)
  })

  it('opens the mixed shelf as its own segment, still saving nothing', async () => {
    const api = fakeIntakeApi()
    renderAt()
    await userEvent.click(
      await screen.findByRole('button', { name: /^Mixed shelf/ }),
    )
    expect(await screen.findByTestId('new-batch')).toHaveTextContent('mixed')
    expect(api.calls('POST', /\/api\/intake\/sittings$/)).toHaveLength(0)
  })

  it('lists unfinished sittings and discards one after asking', async () => {
    const api = fakeIntakeApi({ sittings: [LONGBOX] })
    renderAt()
    const row = await screen.findByRole('listitem')
    expect(row).toHaveTextContent('1 to check, 1 ready, 1 still reading')
    await userEvent.click(
      within(row).getByRole('button', { name: 'Discard Longbox 1' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Yes, discard' }))
    await waitFor(() =>
      expect(screen.getByText('Nothing unfinished')).toBeInTheDocument(),
    )
    expect(api.calls('DELETE', /\/sittings\/s1$/)).toHaveLength(1)
  })

  it('gives the Closet one kind and goes straight to its tile', async () => {
    fakeIntakeApi()
    renderAt('/admin/closet/add')
    const tiles = await screen.findByRole('group', {
      name: adminCopy.add.startSitting,
    })
    expect(within(tiles).getAllByRole('button')).toHaveLength(1)
    expect(within(tiles).getByRole('button')).toHaveTextContent('Garment')
  })

  it('names the Closet start button Garment for assistive tech', async () => {
    fakeIntakeApi()
    renderAt('/admin/closet/add')
    const tiles = await screen.findByRole('group', {
      name: adminCopy.add.startSitting,
    })
    expect(within(tiles).getByRole('button', { name: /Garment/ })).toBeEnabled()
  })

  it('passes axe', async () => {
    fakeIntakeApi({ sittings: [LONGBOX] })
    const { container } = renderAt()
    await screen.findByRole('listitem')
    expect(await axeViolations(container)).toEqual([])
  })
})
