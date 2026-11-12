import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SpotForm from './SpotForm.jsx'

function json(body, status = 200) {
  return { ok: status < 300, status, json: async () => body }
}

const SPOT = {
  id: 's1',
  name: "Sloan's Lake",
  slug: 'sloan-s-lake',
  lat: 39.7505,
  lng: -105.0478,
  neighbourhood: 'Sloan Lake',
  blurb: 'A lap at sunset.',
  tags: ['park'],
  anchor: false,
  is_public: true,
  city: 'denver',
  source: null,
  source_id: null,
  last_visit: null,
  visit_count: 0,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SpotForm', () => {
  it('adds a spot with pasted coordinates and tags in vocabulary order', async () => {
    const fetch = vi.fn(async () => json({ ...SPOT, id: 'new' }, 201))
    vi.stubGlobal('fetch', fetch)
    const onSaved = vi.fn()
    render(<SpotForm spot={null} onSaved={onSaved} onCancel={() => {}} />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Name'), 'Café Max')
    await user.type(
      screen.getByLabelText('Coordinates'),
      'https://maps.example/@39.74,-104.97,17z',
    )
    await user.click(screen.getByRole('button', { name: 'Food' }))
    await user.click(screen.getByRole('button', { name: 'Coffee' }))
    expect(screen.getByRole('button', { name: 'Coffee' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const [url, options] = fetch.mock.calls[0]
    expect(url).toMatch(/\/api\/spots$/)
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({
      name: 'Café Max',
      coords: 'https://maps.example/@39.74,-104.97,17z',
      neighbourhood: '',
      blurb: '',
      tags: ['coffee', 'food'],
      anchor: false,
      is_public: false,
    })
    expect(onSaved).toHaveBeenCalledWith({ ...SPOT, id: 'new' })
  })

  it('edits a spot with a PATCH, prefilled from it', async () => {
    const fetch = vi.fn(async () => json({ ...SPOT, anchor: true }))
    vi.stubGlobal('fetch', fetch)
    const onSaved = vi.fn()
    render(<SpotForm spot={SPOT} onSaved={onSaved} onCancel={() => {}} />)
    const user = userEvent.setup()

    expect(screen.getByLabelText('Coordinates')).toHaveValue(
      '39.7505, -105.0478',
    )
    expect(screen.getByLabelText('Public')).toBeChecked()
    await user.click(screen.getByLabelText('Anchor'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const [url, options] = fetch.mock.calls[0]
    expect(url).toMatch(/\/api\/spots\/s1$/)
    expect(options.method).toBe('PATCH')
    expect(JSON.parse(options.body)).toEqual({ anchor: true })
    expect(onSaved).toHaveBeenCalled()
  })

  it('sends an edit’s changed fields only, coordinates included', async () => {
    const fetch = vi.fn(async () => json(SPOT))
    vi.stubGlobal('fetch', fetch)
    render(<SpotForm spot={SPOT} onSaved={() => {}} onCancel={() => {}} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({})

    const coords = screen.getByLabelText('Coordinates')
    await user.clear(coords)
    await user.type(coords, '39.75, -105.05')
    await user.click(screen.getByRole('button', { name: 'Coffee' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      coords: '39.75, -105.05',
      tags: ['coffee', 'park'],
    })
  })

  it('moves focus to its heading when it opens', () => {
    render(<SpotForm spot={null} onSaved={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Add a spot' })).toHaveFocus()
  })

  it('says the session ended when a save is a 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ detail: 'Not signed in' }, 401)),
    )
    render(<SpotForm spot={SPOT} onSaved={() => {}} onCancel={() => {}} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session ended. Sign in again.',
    )
  })

  it('shows the API’s sentence when it refuses the coordinates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(
          {
            detail:
              'Latitude must be between -90 and 90: the pair looks reversed',
          },
          422,
        ),
      ),
    )
    const onSaved = vi.fn()
    render(<SpotForm spot={null} onSaved={onSaved} onCancel={() => {}} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Name'), 'Home')
    await user.type(screen.getByLabelText('Coordinates'), '-104.99, 39.75')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('looks reversed')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('words a slug race with the API’s own 409 sentence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({ detail: 'Another spot took that name; try again' }, 409),
      ),
    )
    render(<SpotForm spot={SPOT} onSaved={() => {}} onCancel={() => {}} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Another spot took that name',
    )
  })

  it('cancels without a request', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const onCancel = vi.fn()
    render(<SpotForm spot={SPOT} onSaved={() => {}} onCancel={onCancel} />)
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})
