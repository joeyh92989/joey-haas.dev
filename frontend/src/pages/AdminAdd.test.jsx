import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import { entry, fakeIntakeApi, KINDS, photo } from '../lib/intake.test-util.js'
import AdminAdd from './AdminAdd.jsx'

function Sitting() {
  return <p data-testid="sitting">{useParams().sittingId}</p>
}

function renderAt(path = '/admin/collection/add') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/collection/add" element={<AdminAdd />} />
        <Route path="/admin/closet/add" element={<AdminAdd />} />
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
    const tiles = await screen.findByRole('group', { name: 'Start a sitting' })
    const names = within(tiles)
      .getAllByRole('button')
      .map((tile) => tile.querySelector('.intake-kind-name').textContent)
    expect(names).toEqual([
      'Game',
      'Movie',
      'Comic',
      'Board game',
      'Mixed shelf',
    ])
    expect(
      within(tiles).getByRole('button', { name: /Board game/ }),
    ).toBeDisabled()
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

  it('starts a sitting of the kind pressed and opens it', async () => {
    const api = fakeIntakeApi()
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: /^Movie/ }))
    expect(await screen.findByTestId('sitting')).toHaveTextContent('new-1')
    expect(api.calls('POST', /\/api\/intake\/sittings$/)[0].body).toMatchObject(
      {
        area: 'shelf',
        kind: 'movie',
      },
    )
  })

  it('starts a mixed sitting with no kind', async () => {
    const api = fakeIntakeApi()
    renderAt()
    await userEvent.click(
      await screen.findByRole('button', { name: /^Mixed shelf/ }),
    )
    await screen.findByTestId('sitting')
    expect(
      api.calls('POST', /\/api\/intake\/sittings$/)[0].body.kind,
    ).toBeNull()
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
    const tiles = await screen.findByRole('group', { name: 'Start a sitting' })
    expect(within(tiles).getAllByRole('button')).toHaveLength(1)
    expect(within(tiles).getByRole('button')).toHaveTextContent('Garment')
  })

  it('passes axe', async () => {
    fakeIntakeApi({ sittings: [LONGBOX] })
    const { container } = renderAt()
    await screen.findByRole('listitem')
    expect(await axeViolations(container)).toEqual([])
  })
})
