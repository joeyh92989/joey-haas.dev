import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeIntakeApi } from '../lib/intake.test-util.js'
import { takeFiles } from '../lib/intakeHandoff.js'
import AdminNewBatch from './AdminNewBatch.jsx'

function Batch() {
  return <p data-testid="batch">{useParams().sittingId}</p>
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/admin/collection/add/new/:kind"
          element={<AdminNewBatch />}
        />
        <Route path="/admin/closet/add/new/:kind" element={<AdminNewBatch />} />
        <Route path="/admin/collection/add/:sittingId" element={<Batch />} />
        <Route path="/admin/closet/add/:sittingId" element={<Batch />} />
      </Routes>
    </MemoryRouter>,
  )
}

const photo = () => new File(['x'], 'shelf.jpg', { type: 'image/jpeg' })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AdminNewBatch', () => {
  it('saves nothing until a photo is chosen', async () => {
    const api = fakeIntakeApi()
    renderAt('/admin/collection/add/new/comic')
    expect(
      await screen.findByRole('heading', { name: 'New batch · Comic' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Nothing is saved until you add a photo/),
    ).toBeInTheDocument()
    expect(api.calls('POST', /\/api\/intake\/sittings$/)).toHaveLength(0)
  })

  it('creates the batch on the first photo and hands the files on', async () => {
    const api = fakeIntakeApi()
    renderAt('/admin/collection/add/new/comic')
    await screen.findByRole('heading', { name: 'New batch · Comic' })
    await userEvent.upload(screen.getByLabelText('Choose files'), photo())
    expect(await screen.findByTestId('batch')).toHaveTextContent('new-1')
    const [made] = api.calls('POST', /\/api\/intake\/sittings$/)
    expect(made.body).toMatchObject({ area: 'shelf', kind: 'comic' })
    expect(takeFiles('new-1')).toHaveLength(1)
  })

  it('makes a mixed batch with no kind', async () => {
    const api = fakeIntakeApi()
    renderAt('/admin/collection/add/new/mixed')
    await screen.findByRole('heading', { name: 'New batch · Mixed shelf' })
    await userEvent.upload(screen.getByLabelText('Choose files'), photo())
    await screen.findByTestId('batch')
    expect(
      api.calls('POST', /\/api\/intake\/sittings$/)[0].body.kind,
    ).toBeNull()
  })

  it('refuses a file the server would, without creating a batch', async () => {
    const api = fakeIntakeApi()
    renderAt('/admin/collection/add/new/comic')
    await screen.findByRole('heading', { name: 'New batch · Comic' })
    await userEvent.upload(
      screen.getByLabelText('Choose files'),
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
      { applyAccept: false },
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('notes.txt')
    expect(api.calls('POST', /\/api\/intake\/sittings$/)).toHaveLength(0)
  })

  it('says so for a kind Add does not offer', async () => {
    fakeIntakeApi()
    renderAt('/admin/collection/add/new/movie')
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /not on the Add page/,
      ),
    )
  })
})
