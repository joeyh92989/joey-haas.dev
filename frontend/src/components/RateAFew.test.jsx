import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RateAFew from './RateAFew.jsx'

function game(id, fields = {}) {
  return {
    id,
    type: 'game',
    title: `Game ${id}`,
    status: 'finished',
    rating: null,
    platform: 'Nintendo Switch',
    ...fields,
  }
}

function stars(title) {
  return screen.getByRole('group', { name: `Rating for ${title}` })
}

function row(title) {
  return screen
    .getByRole('rowheader', { name: new RegExp(title) })
    .closest('tr')
}

function stubSaves() {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('RateAFew', () => {
  it('lays out unrated finished games as table rows, six at most', () => {
    const items = [
      ...Array.from({ length: 8 }, (_, index) => game(`g${index}`)),
      game('rated', { rating: 7 }),
      game('backlog', { status: 'backlog' }),
      game('film', { type: 'film' }),
    ]
    render(<RateAFew items={items} />)
    expect(
      screen.getAllByRole('columnheader').map((cell) => cell.textContent),
    ).toEqual(['Game', 'Rating', 'Saved'])
    expect(screen.getAllByRole('rowheader')).toHaveLength(6)
    expect(row('Game g0')).toHaveTextContent('Game g0 · Nintendo Switch')
    expect(within(row('Game g0')).getByText('—')).toBeInTheDocument()
    expect(screen.queryByRole('rowheader', { name: /Game rated/ })).toBeNull()
    expect(screen.queryByRole('rowheader', { name: /Game backlog/ })).toBeNull()
    expect(screen.queryByRole('rowheader', { name: /Game film/ })).toBeNull()
  })

  it('keeps a rated game in its row with the score it saved', async () => {
    const fetchMock = stubSaves()
    const onRated = vi.fn()
    render(<RateAFew items={[game('a'), game('b')]} onRated={onRated} />)
    await userEvent.click(
      within(stars('Game a')).getByRole('radio', { name: 'Rate 8 out of 10' }),
    )
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/api\/items\/a$/)
    expect(options.method).toBe('PATCH')
    expect(JSON.parse(options.body)).toEqual({ rating: 8 })
    expect(
      await within(row('Game a')).findByText('8/10 saved'),
    ).toBeInTheDocument()
    expect(
      within(stars('Game a')).getByRole('radio', { name: 'Clear rating' }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(within(row('Game b')).getByText('—')).toBeInTheDocument()
    expect(onRated).toHaveBeenCalledTimes(1)
  })

  it('re-rates and clears a mis-tap', async () => {
    const fetchMock = stubSaves()
    render(<RateAFew items={[game('a')]} />)
    await userEvent.click(
      within(stars('Game a')).getByRole('radio', { name: 'Rate 3 out of 10' }),
    )
    await within(row('Game a')).findByText('3/10 saved')
    await userEvent.click(
      within(stars('Game a')).getByRole('radio', { name: 'Rate 9 out of 10' }),
    )
    await within(row('Game a')).findByText('9/10 saved')
    await userEvent.click(
      within(stars('Game a')).getByRole('radio', { name: 'Clear rating' }),
    )
    await within(row('Game a')).findByText('—')
    expect(
      fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body)),
    ).toEqual([{ rating: 3 }, { rating: 9 }, { rating: null }])
  })

  it('offers the next few once every game shown is rated', async () => {
    stubSaves()
    const items = Array.from({ length: 7 }, (_, index) => game(`g${index}`))
    render(<RateAFew items={items} />)
    expect(screen.queryByRole('button', { name: 'Next few' })).toBeNull()
    for (let index = 0; index < 6; index += 1) {
      await userEvent.click(
        within(stars(`Game g${index}`)).getByRole('radio', {
          name: 'Rate 7 out of 10',
        }),
      )
      await within(row(`Game g${index}`)).findByText('7/10 saved')
    }
    await userEvent.click(screen.getByRole('button', { name: 'Next few' }))
    expect(
      screen.getAllByRole('rowheader').map((cell) => cell.textContent),
    ).toEqual(['Game g6 · Nintendo Switch'])
  })

  it('saves a second game while the first is still saving', async () => {
    let finish
    const fetchMock = vi.fn((url) =>
      String(url).endsWith('/a')
        ? new Promise((resolve) => {
            finish = () => resolve({ ok: true, status: 200 })
          })
        : Promise.resolve({ ok: true, status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<RateAFew items={[game('a'), game('b')]} />)
    await userEvent.click(
      within(stars('Game a')).getByRole('radio', { name: 'Rate 7 out of 10' }),
    )
    await userEvent.click(
      within(stars('Game b')).getByRole('radio', { name: 'Rate 5 out of 10' }),
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await within(row('Game b')).findByText('5/10 saved')
    finish()
    await waitFor(() =>
      expect(within(row('Game a')).getByText('7/10 saved')).toBeInTheDocument(),
    )
  })

  it('shows no score and says why when the save fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Database unavailable' }),
      }),
    )
    render(<RateAFew items={[game('a')]} />)
    await userEvent.click(
      within(stars('Game a')).getByRole('radio', { name: 'Rate 6 out of 10' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Game a: Database unavailable',
    )
    expect(within(row('Game a')).getByText('—')).toBeInTheDocument()
  })

  it('hides on Not now and stays hidden', async () => {
    const { unmount } = render(<RateAFew items={[game('a')]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('heading', { name: 'Rate a few' })).toBeNull()
    unmount()
    render(<RateAFew items={[game('a')]} />)
    expect(screen.queryByRole('heading', { name: 'Rate a few' })).toBeNull()
  })

  it('renders nothing when every finished game is rated', () => {
    const { container } = render(
      <RateAFew items={[game('a', { rating: 9 })]} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
