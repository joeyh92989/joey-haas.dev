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
        body:
          typeof options.body === 'string'
            ? JSON.parse(options.body)
            : undefined,
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

  it('adds a photo from a picked file and shows the new one', async () => {
    const calls = stubApi({
      'GET /api/closet/garments/g1': () => json({ ...GARMENT, image: null }),
      'POST /api/closet/garments/g1/photo': () =>
        json({ ...GARMENT, image: '/api/closet/garments/g1/image?v=2' }),
    })
    renderAt('/admin/closet/g1')
    const input = await screen.findByLabelText('Photo file')
    expect(screen.getByText('Add photo')).toBeInTheDocument()
    await userEvent.upload(
      input,
      new File(['x'], 'shirt.jpg', { type: 'image/jpeg' }),
    )
    expect(await screen.findByText('Photo saved.')).toBeInTheDocument()
    expect(calls.some((c) => c.path === '/api/closet/garments/g1/photo')).toBe(
      true,
    )
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      expect.stringContaining('v=2'),
    )
    expect(screen.getByText('Replace photo')).toBeInTheDocument()
  })

  it('says why a photo was refused', async () => {
    stubApi({
      'GET /api/closet/garments/g1': () => json(GARMENT),
      'POST /api/closet/garments/g1/photo': () =>
        json({ detail: 'That file could not be read as a photo' }, 422),
    })
    renderAt('/admin/closet/g1')
    await userEvent.upload(
      await screen.findByLabelText('Photo file'),
      new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'could not be read as a photo',
    )
  })

  const PREVIEW = {
    state: 'read',
    message: null,
    url: 'https://store.test/products/crew',
    title: 'Test Crew',
    brand: 'Acme',
    currency: 'USD',
    attached: null,
    has_photo: false,
    candidates: [
      {
        external_id: '11',
        title: 'Red',
        color_name: 'Red',
        image_url: null,
        price: '42.50',
        sizes: [
          { size: 'S', variant_id: '11', available: false },
          { size: 'M', variant_id: '12', available: true },
        ],
      },
      {
        external_id: '13',
        title: 'Blue',
        color_name: 'Blue',
        image_url: null,
        price: '40.00',
        sizes: [{ size: 'S', variant_id: '13', available: true }],
      },
    ],
  }

  it('attaches a product after the owner picks a color and a size', async () => {
    const calls = stubApi({
      'GET /api/closet/garments/g1': () => json({ ...GARMENT, brand: 'Old' }),
      'POST /api/closet/garments/g1/product': () => json(PREVIEW),
      'PATCH /api/closet/garments/g1/product': () =>
        json({
          garment: { ...GARMENT, brand: 'Acme', color_name: 'Red', size: 'M' },
          photo: 'kept',
          photo_error: null,
          kept: [],
          product: { url: PREVIEW.url, title: 'Test Crew', source: 'link' },
        }),
    })
    renderAt('/admin/closet/g1')
    await userEvent.type(
      await screen.findByLabelText('Product link'),
      PREVIEW.url,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Look it up' }))
    const attach = await screen.findByRole('button', {
      name: 'Attach product',
    })
    expect(attach).toBeDisabled()
    await userEvent.click(screen.getByLabelText(/^Red/))
    await userEvent.selectOptions(
      screen.getByLabelText('Size in this color'),
      'M',
    )
    await userEvent.click(
      screen.getByLabelText('Replace the brand “Old” with “Acme”'),
    )
    await userEvent.click(attach)
    expect(await screen.findByText(/Product attached/)).toBeInTheDocument()
    const sent = calls.find((c) => c.method === 'PATCH')
    expect(sent.body).toEqual({
      url: PREVIEW.url,
      external_id: '11',
      size: 'M',
      replace_brand: true,
      replace_color: false,
      replace_size: false,
      replace_product: false,
    })
    // The form starts again from what the API now holds.
    expect(screen.getByLabelText('Store color')).toHaveValue('Red')
    expect(screen.getByLabelText('Size')).toHaveValue('M')
  })

  it('asks before replacing an attached product', async () => {
    stubApi({
      'GET /api/closet/garments/g1': () => json(GARMENT),
      'POST /api/closet/garments/g1/product': () =>
        json({
          ...PREVIEW,
          attached: {
            url: 'https://old.test/p',
            title: 'Old Crew',
            source: 'link',
          },
        }),
    })
    renderAt('/admin/closet/g1')
    await userEvent.type(
      await screen.findByLabelText('Product link'),
      PREVIEW.url,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Look it up' }))
    await userEvent.click(await screen.findByLabelText(/^Blue/))
    const attach = screen.getByRole('button', { name: 'Attach product' })
    expect(attach).toBeDisabled()
    await userEvent.click(
      screen.getByLabelText(/already has a product \(Old Crew\)/),
    )
    expect(attach).toBeEnabled()
  })

  it('shows the reason a link was refused and leaves the photo option', async () => {
    stubApi({
      'GET /api/closet/garments/g1': () => json(GARMENT),
      'POST /api/closet/garments/g1/product': () =>
        json({
          ...PREVIEW,
          state: 'refused',
          message:
            'refuses.test asks programs not to read that page (robots.txt)',
          candidates: [],
        }),
    })
    renderAt('/admin/closet/g1')
    await userEvent.type(
      await screen.findByLabelText('Product link'),
      PREVIEW.url,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Look it up' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('robots.txt')
    expect(screen.getByRole('alert')).toHaveTextContent('add a photo')
    expect(screen.queryByRole('button', { name: 'Attach product' })).toBeNull()
  })

  it('keeps a hand-entered color and size unless the owner ticks to replace', async () => {
    const calls = stubApi({
      'GET /api/closet/garments/g1': () =>
        json({
          ...GARMENT,
          color_name: 'Slate',
          color_source: 'manual',
          size: 'L',
        }),
      'POST /api/closet/garments/g1/product': () => json(PREVIEW),
      'PATCH /api/closet/garments/g1/product': () =>
        json({
          garment: { ...GARMENT, color_name: 'Red', size: 'M' },
          photo: 'kept',
          photo_error: null,
          kept: [],
          product: { url: PREVIEW.url, title: 'Test Crew', source: 'link' },
        }),
    })
    renderAt('/admin/closet/g1')
    await userEvent.type(
      await screen.findByLabelText('Product link'),
      PREVIEW.url,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Look it up' }))
    await userEvent.click(await screen.findByLabelText(/^Red/))
    await userEvent.selectOptions(
      screen.getByLabelText('Size in this color'),
      'M',
    )
    await userEvent.click(
      screen.getByLabelText('Replace the color “Slate” with “Red”'),
    )
    await userEvent.click(
      screen.getByLabelText('Replace the size “L” with “M”'),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Attach product' }),
    )
    await screen.findByText(/Product attached/)
    expect(calls.find((c) => c.method === 'PATCH').body).toMatchObject({
      replace_color: true,
      replace_size: true,
    })
  })
})
