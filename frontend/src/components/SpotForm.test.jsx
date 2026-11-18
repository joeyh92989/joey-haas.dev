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
      city: 'Denver',
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

describe('SpotForm initialName', () => {
  it('starts a new spot with the given name, and an edit ignores it', () => {
    const { unmount } = render(
      <SpotForm
        spot={null}
        initialName="Cafe Brazil"
        onSaved={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByLabelText('Name')).toHaveValue('Cafe Brazil')
    unmount()
    render(
      <SpotForm
        spot={SPOT}
        initialName="Cafe Brazil"
        onSaved={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByLabelText('Name')).toHaveValue("Sloan's Lake")
  })
})

/** A faithful fake of the spots API's city rules (story #343). */
function fakeSpotsApi(existing = null) {
  return vi.fn(async (url, options) => {
    const body = JSON.parse(options.body)
    const base = existing ?? { ...SPOT, id: 'new', is_public: false }
    const next = { ...base, ...body }
    // Like the route: the city rule and the public-city rule run only when
    // the body carries city or is_public; length is counted after normalising.
    if ('city' in body || 'is_public' in body) {
      if ('city' in body) {
        const city = String(body.city ?? '')
          .replace(/[\p{Cc}\p{Cf}]/gu, (ch) => (/\s/.test(ch) ? ch : ''))
          .trim()
          .replace(/\s+/g, ' ')
          .toLowerCase()
        if (!city) return json({ detail: 'A city is required.' }, 422)
        if (city.length > 40) {
          return json({ detail: 'A city is at most 40 characters.' }, 422)
        }
        next.city = city
      }
      if (next.is_public && next.city !== 'denver') {
        return json({ detail: 'A public place has to be in Denver.' }, 422)
      }
    }
    return json(next, existing ? 200 : 201)
  })
}

describe('SpotForm city (story #343)', () => {
  const BOULDER = { ...SPOT, city: 'boulder', is_public: false }

  function open(props = {}) {
    return render(
      <SpotForm
        spot={null}
        onSaved={() => {}}
        onCancel={() => {}}
        {...props}
      />,
    )
  }

  it('starts a new spot in Denver and offers the used cities in a datalist', () => {
    const { container } = open({ cities: ['boulder', 'fort collins'] })
    expect(screen.getByLabelText('City')).toHaveValue('Denver')
    expect(
      [...container.querySelectorAll('datalist option')].map((o) => o.value),
    ).toEqual(['Denver', 'Boulder', 'Fort Collins'])
  })

  it('disables Public with the Denver-only hint off Denver and re-checks it on return', async () => {
    open()
    const user = userEvent.setup()
    const city = screen.getByLabelText('City')
    const box = screen.getByLabelText('Public')
    await user.click(box)
    expect(box).toBeChecked()
    await user.clear(city)
    await user.type(city, 'Boulder')
    expect(box).toBeDisabled()
    expect(box).not.toBeChecked()
    expect(
      screen.getByText('Only a Denver place can be shown on the public page.'),
    ).toBeInTheDocument()
    await user.clear(city)
    await user.type(city, ' denver ')
    expect(box).toBeEnabled()
    expect(box).toBeChecked()
  })

  it('keeps a public spot public when "Denver" is retyped, and sends false only when it really leaves', async () => {
    const fetch = fakeSpotsApi()
    vi.stubGlobal('fetch', fetch)
    open()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Name'), 'X')
    await user.type(screen.getByLabelText('Coordinates'), '39.7, -104.9')
    await user.click(screen.getByLabelText('Public'))
    const city = screen.getByLabelText('City')
    await user.clear(city)
    await user.type(city, 'Bo')
    await user.clear(city)
    await user.type(city, 'Denver')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(JSON.parse(fetch.mock.calls[0][1].body).is_public).toBe(true)
  })

  it('sends is_public false when saved off Denver', async () => {
    const fetch = fakeSpotsApi()
    vi.stubGlobal('fetch', fetch)
    open()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Name'), 'X')
    await user.type(screen.getByLabelText('Coordinates'), '39.7, -104.9')
    await user.click(screen.getByLabelText('Public'))
    const city = screen.getByLabelText('City')
    await user.clear(city)
    await user.type(city, 'Boulder')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(JSON.parse(fetch.mock.calls[0][1].body).is_public).toBe(false)
  })

  it('refuses a zero-width-only city on the client', async () => {
    const fetch = fakeSpotsApi()
    vi.stubGlobal('fetch', fetch)
    open()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Name'), 'X')
    await user.type(screen.getByLabelText('Coordinates'), '39.7, -104.9')
    const city = screen.getByLabelText('City')
    await user.clear(city)
    await user.paste('\u200b\u200d')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A city is required.',
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('treats a blank city as Denver on screen but refuses to send it', async () => {
    const fetch = fakeSpotsApi()
    vi.stubGlobal('fetch', fetch)
    open()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Name'), 'X')
    await user.type(screen.getByLabelText('Coordinates'), '39.7, -104.9')
    await user.clear(screen.getByLabelText('City'))
    expect(screen.getByLabelText('Public')).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A city is required.',
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends the city as typed on create', async () => {
    const fetch = fakeSpotsApi()
    vi.stubGlobal('fetch', fetch)
    const onSaved = vi.fn()
    open({ onSaved })
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Name'), 'Falls')
    await user.type(screen.getByLabelText('Coordinates'), '40.0, -105.3')
    const city = screen.getByLabelText('City')
    await user.clear(city)
    await user.type(city, '  Fort   Collins ')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(JSON.parse(fetch.mock.calls[0][1].body).city).toBe('Fort   Collins')
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ city: 'fort collins' }),
    )
  })

  it('shows a 422 on the city in the server’s words', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({ detail: 'A city is at most 40 characters.' }, 422),
      ),
    )
    open()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Name'), 'Falls')
    await user.type(screen.getByLabelText('Coordinates'), '40.0, -105.3')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A city is at most 40 characters.',
    )
  })

  it('opens an existing Boulder spot showing Boulder with Public disabled', () => {
    open({ spot: BOULDER })
    expect(screen.getByLabelText('City')).toHaveValue('Boulder')
    expect(screen.getByLabelText('Public')).toBeDisabled()
  })

  it('sends an edit’s city only when it changed', async () => {
    const fetch = fakeSpotsApi(BOULDER)
    vi.stubGlobal('fetch', fetch)
    open({ spot: BOULDER })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({})

    const city = screen.getByLabelText('City')
    await user.clear(city)
    await user.type(city, 'boulder ')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({})

    await user.clear(city)
    await user.type(city, 'Golden')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ city: 'Golden' })
  })

  it('moving a public Denver spot away sends it private in the same PATCH', async () => {
    const fetch = fakeSpotsApi(SPOT)
    vi.stubGlobal('fetch', fetch)
    const onSaved = vi.fn()
    open({ spot: SPOT, onSaved })
    const user = userEvent.setup()
    const city = screen.getByLabelText('City')
    await user.clear(city)
    await user.type(city, 'Boulder')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      city: 'Boulder',
      is_public: false,
    })
    expect(onSaved).toHaveBeenCalled()
  })
})
