import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'
import { LOAD_ERROR } from '../content/status.js'
import { denver } from '../content/denver.js'
import Denver, { filterSpots, parseTags, tagCounts } from './Denver.jsx'

const media = { phone: false }
vi.mock('../lib/useMediaQuery.js', () => ({
  useMediaQuery: () => media.phone,
}))
vi.mock('../lib/useSnapshotThenLive.js', () => ({
  useSnapshotThenLive: vi.fn(),
}))

const copy = denver.page

const spot = (name, fields = {}) => ({
  spot_id: `id-${name}`,
  name,
  slug: name.toLowerCase().replace(/\W+/g, '-'),
  neighbourhood: 'LoDo',
  tags: [],
  blurb: null,
  lat: 39.7527,
  lng: -105.0003,
  ...fields,
})

const SPOTS = [
  spot('Union Station', {
    tags: ['kid-ok', 'rainy-day'],
    blurb: 'Great hall, trains to watch.',
  }),
  spot('Commons Park', {
    tags: ['park', 'kid-ok'],
    lat: 39.7578,
    lng: -105.0072,
  }),
  spot('Red Rocks', {
    neighbourhood: 'Morrison',
    tags: ['park'],
    lat: 39.6654,
    lng: -105.2057,
  }),
]

function LocationProbe() {
  return <output data-testid="search">{useLocation().search}</output>
}
const search = () => screen.getByTestId('search').textContent

/** A link elsewhere on the page (the footer's) that drops the filter. */
function PlainLink() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate('/denver')}>
      Plain Denver
    </button>
  )
}

function renderPage(path = '/denver', data = SPOTS, { link = false } = {}) {
  useSnapshotThenLive.mockReturnValue({ data, live: true, failed: false })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/denver"
          element={
            <>
              <Denver />
              <LocationProbe />
              {link ? <PlainLink /> : null}
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

const chips = () => screen.getByRole('group', { name: copy.tagsLabel })
const cardNames = () =>
  screen
    .queryAllByRole('article')
    .map((card) => within(card).getByRole('heading').textContent)

afterEach(() => {
  media.phone = false
  vi.clearAllMocks()
})

describe('the pure helpers', () => {
  it('reads known tags from the query, once each, in vocabulary order', () => {
    expect(parseTags('kid-ok,park,nope,park')).toEqual(['park', 'kid-ok'])
    expect(parseTags(null)).toEqual([])
    expect(parseTags('')).toEqual([])
  })

  it('ANDs the pressed tags', () => {
    expect(filterSpots(SPOTS, ['park', 'kid-ok']).map((s) => s.name)).toEqual([
      'Commons Park',
    ])
    expect(filterSpots(SPOTS, [])).toHaveLength(3)
  })

  it('counts tags over the unfiltered list', () => {
    const counts = Object.fromEntries(
      tagCounts(SPOTS).map(({ tag, count }) => [tag, count]),
    )
    expect(counts).toMatchObject({ park: 2, 'kid-ok': 2, 'rainy-day': 1 })
    expect(counts.coffee).toBe(0)
  })
})

describe('Denver', () => {
  it('shows the heading, lede and every spot as a card', () => {
    renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: copy.title }),
    ).toBeInTheDocument()
    expect(screen.getByText(copy.lede)).toBeInTheDocument()
    expect(cardNames()).toEqual(['Union Station', 'Commons Park', 'Red Rocks'])
    expect(screen.getByText('3 spots')).toBeInTheDocument()
    expect(screen.getByText('Great hall, trains to watch.')).toBeInTheDocument()
  })

  it('pins the spots on the map and marks one outside it off the map', () => {
    renderPage()
    expect(
      screen.getByRole('img', { name: copy.mapLabel(2) }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Union Station, Kid-OK, Rainy day' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Red Rocks,/ })).toBeNull()
    const redRocks = screen.getAllByRole('article')[2]
    expect(within(redRocks).getByText(copy.offMap)).toBeInTheDocument()
    const union = screen.getAllByRole('article')[0]
    expect(within(union).queryByText(copy.offMap)).toBeNull()
  })

  it('hides chips with nothing behind them and counts the rest', () => {
    renderPage()
    const row = chips()
    expect(within(row).getByRole('button', { name: 'All 3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(row).getByRole('button', { name: 'Park 2' })).toBeVisible()
    expect(within(row).queryByRole('button', { name: /Coffee/ })).toBeNull()
  })

  it('ANDs pressed chips and mirrors them to ?tag=', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(within(chips()).getByRole('button', { name: 'Park 2' }))
    expect(cardNames()).toEqual(['Commons Park', 'Red Rocks'])
    expect(search()).toBe('?tag=park')
    await user.click(within(chips()).getByRole('button', { name: 'Kid-OK 2' }))
    expect(cardNames()).toEqual(['Commons Park'])
    expect(new URLSearchParams(search()).get('tag')).toBe('park,kid-ok')
    expect(screen.getByText('1 spot')).toBeInTheDocument()

    await user.click(within(chips()).getByRole('button', { name: 'All 3' }))
    expect(cardNames()).toHaveLength(3)
    expect(search()).toBe('')
  })

  it('opens filtered from a shared link, ignoring unknown tags', () => {
    renderPage('/denver?tag=rainy-day,bogus')
    expect(cardNames()).toEqual(['Union Station'])
    expect(
      within(chips()).getByRole('button', { name: 'Rainy day 1' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('says so when no spot has every pressed tag', () => {
    renderPage('/denver?tag=rainy-day,park')
    expect(screen.getByText(copy.noMatch)).toBeInTheDocument()
  })

  it('selects a spot from its pin, its card or neither, one at a time', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    renderPage()
    const pin = screen.getByRole('button', {
      name: 'Union Station, Kid-OK, Rainy day',
    })
    await user.click(pin)
    const [union, commons] = screen.getAllByRole('article')
    expect(union).toHaveClass('selected')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.spot-map-popover')).toHaveTextContent(
      'Union Station',
    )

    await user.click(
      within(commons).getByRole('button', { name: 'Commons Park' }),
    )
    expect(union).not.toHaveClass('selected')
    expect(commons).toHaveClass('selected')
    expect(
      screen.getByRole('button', { name: 'Commons Park, Park, Kid-OK' }),
    ).toHaveAttribute('aria-pressed', 'true')

    await user.keyboard('{Escape}')
    expect(commons).not.toHaveClass('selected')
    delete Element.prototype.scrollIntoView
  })

  it('drops a selection that a filter hides', async () => {
    const user = userEvent.setup()
    renderPage()
    const union = screen.getAllByRole('article')[0]
    await user.click(
      within(union).getByRole('button', { name: 'Union Station' }),
    )
    await user.click(within(chips()).getByRole('button', { name: 'Park 2' }))
    await user.click(within(chips()).getByRole('button', { name: 'All 3' }))
    expect(screen.getAllByRole('article')[0]).not.toHaveClass('selected')
  })

  it('drops a hidden selection when a link, not a chip, lifts the filter', async () => {
    const user = userEvent.setup()
    renderPage('/denver', SPOTS, { link: true })
    const union = screen.getAllByRole('article')[0]
    await user.click(
      within(union).getByRole('button', { name: 'Union Station' }),
    )
    await user.click(within(chips()).getByRole('button', { name: 'Park 2' }))
    await user.click(screen.getByRole('button', { name: 'Plain Denver' }))
    expect(search()).toBe('')
    expect(cardNames()).toHaveLength(3)
    expect(screen.getAllByRole('article')[0]).not.toHaveClass('selected')
  })

  it('keeps a selection the new filter still shows', async () => {
    const user = userEvent.setup()
    renderPage()
    const commons = screen.getAllByRole('article')[1]
    await user.click(
      within(commons).getByRole('button', { name: 'Commons Park' }),
    )
    await user.click(within(chips()).getByRole('button', { name: 'Park 2' }))
    expect(screen.getAllByRole('article')[0]).toHaveClass('selected')
  })

  it('clears a selection on Escape with focus on the page body', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(
      screen.getByRole('button', { name: 'Union Station, Kid-OK, Rainy day' }),
    )
    expect(screen.getAllByRole('article')[0]).toHaveClass('selected')
    // Safari does not focus a clicked button, so the key lands on the body.
    document.activeElement.blur()
    await user.keyboard('{Escape}')
    expect(screen.getAllByRole('article')[0]).not.toHaveClass('selected')
  })

  it('opens on the list on a phone, with the map one tap away', async () => {
    media.phone = true
    const user = userEvent.setup()
    renderPage()
    const view = screen.getByRole('group', { name: copy.viewLabel })
    expect(within(view).getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.queryByRole('img')).toBeNull()
    expect(cardNames()).toHaveLength(3)

    await user.click(within(view).getByRole('button', { name: 'Map' }))
    expect(screen.getByRole('img', { name: copy.mapLabel(2) })).toBeVisible()
    expect(screen.queryAllByRole('article')).toHaveLength(0)
  })

  it('has no view toggle on a desktop', () => {
    renderPage()
    expect(screen.queryByRole('group', { name: copy.viewLabel })).toBeNull()
  })

  it('says when there are no spots, and when they failed to load', () => {
    const { unmount } = renderPage('/denver', [])
    expect(screen.getByText(copy.empty)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: copy.tagsLabel })).toBeNull()
    unmount()

    useSnapshotThenLive.mockReturnValue({
      data: null,
      live: false,
      failed: true,
    })
    render(
      <MemoryRouter initialEntries={['/denver']}>
        <Denver />
      </MemoryRouter>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(LOAD_ERROR)
  })

  it('has no axe violations', async () => {
    const { container } = renderPage()
    expect(await axeViolations(container)).toEqual([])
  })
})
