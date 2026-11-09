import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminGarment from './AdminGarment.jsx'

const GARMENT = {
  id: 'g1',
  name: null,
  category: null,
  subtype: null,
  brand: null,
  primary_color: null,
  primary_hex: null,
  secondary_color: null,
  secondary_hex: null,
  pattern: null,
  material: null,
  warmth: null,
  formality: null,
  seasons: [],
  notes: null,
  acquired_on: null,
  status: 'untagged',
  back_on: null,
  tag_source: null,
  tag_attempts: 0,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
  image: '/api/closet/garments/g1/image?v=1',
  wears_12mo: 0,
  last_worn: null,
}

function json(body, status = 200) {
  return { ok: status < 300, status, json: async () => body }
}

function stubApi(handlers) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      const path = String(url).replace(/^.*\/api/, '/api')
      const method = options.method ?? 'GET'
      calls.push({
        method,
        path,
        body: options.body ? JSON.parse(options.body) : undefined,
      })
      const handler = handlers[`${method} ${path}`]
      return handler ? handler(options) : json({}, 404)
    }),
  )
  return calls
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/closet/:id" element={<AdminGarment />} />
        <Route path="/admin/closet" element={<p>The closet</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('AdminGarment', () => {
  it('saves the fields by hand as one PATCH', async () => {
    const calls = stubApi({
      'GET /api/closet/garments/g1': () => json(GARMENT),
      'PATCH /api/closet/garments/g1': (options) =>
        json({
          ...GARMENT,
          ...JSON.parse(options.body),
          tag_source: 'manual',
        }),
    })
    renderAt('/admin/closet/g1')
    await userEvent.type(await screen.findByLabelText('Name'), 'Grey chinos')
    await userEvent.click(screen.getByLabelText('Bottom'))
    await userEvent.click(screen.getByRole('button', { name: 'More warmth' }))
    await userEvent.click(screen.getByRole('button', { name: 'Apr' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/^Saved ·/)).toBeInTheDocument()
    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch.body).toMatchObject({
      name: 'Grey chinos',
      category: 'bottom',
      warmth: 3,
      formality: null,
      seasons: [4],
      status: 'active',
      brand: null,
    })
  })

  it('gives a packed garment a Back in month a browser without the picker can take', async () => {
    stubApi({
      'GET /api/closet/garments/g1': () =>
        json({ ...GARMENT, status: 'packed', back_on: '2027-05-01' }),
    })
    renderAt('/admin/closet/g1')
    const back = await screen.findByLabelText('Back in')
    expect(back).toHaveAttribute('pattern', '\\d{4}-\\d{2}')
    expect(back).toHaveAttribute('placeholder', '2027-05')
    expect(back).toHaveValue('2027-05')
  })

  it('deletes after a second press and returns to the closet', async () => {
    const calls = stubApi({
      'GET /api/closet/garments/g1': () => json(GARMENT),
      'DELETE /api/closet/garments/g1': () => ({ ok: true, status: 204 }),
    })
    renderAt('/admin/closet/g1')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete for good' }),
    )
    expect(await screen.findByText('The closet')).toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1)
  })

  it('says so for an unknown id', async () => {
    stubApi({})
    renderAt('/admin/closet/nope')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No garment has this id.',
    )
  })
})
