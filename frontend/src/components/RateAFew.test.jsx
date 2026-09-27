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
    ...fields,
  }
}

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('RateAFew', () => {
  it('lists only unrated finished games, six at most', () => {
    const items = [
      ...Array.from({ length: 8 }, (_, index) => game(`g${index}`)),
      game('rated', { rating: 7 }),
      game('backlog', { status: 'backlog' }),
      game('film', { type: 'film' }),
    ]
    render(<RateAFew items={items} />)
    const groups = screen.getAllByRole('group')
    expect(groups).toHaveLength(6)
    expect(screen.queryByRole('group', { name: 'Game rated' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Game backlog' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Game film' })).toBeNull()
  })

  it('saves a rating and takes the game off the list', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
    const onRated = vi.fn()
    render(<RateAFew items={[game('a'), game('b')]} onRated={onRated} />)
    const card = screen.getByRole('group', { name: 'Game a' })
    await userEvent.click(
      within(card).getByRole('radio', { name: 'Rate 8 out of 10' }),
    )
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/api\/items\/a$/)
    expect(options.method).toBe('PATCH')
    expect(JSON.parse(options.body)).toEqual({ rating: 8 })
    expect(screen.queryByRole('group', { name: 'Game a' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Game b' })).toBeInTheDocument()
    expect(onRated).toHaveBeenCalledTimes(1)
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
      within(screen.getByRole('group', { name: 'Game a' })).getByRole('radio', {
        name: 'Rate 7 out of 10',
      }),
    )
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Game b' })).getByRole('radio', {
        name: 'Rate 5 out of 10',
      }),
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('group', { name: 'Game b' })).toBeNull()
    finish()
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Game a' })).toBeNull(),
    )
  })

  it('keeps each game a list item', () => {
    render(<RateAFew items={[game('a'), game('b')]} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('keeps the game and says why when the save fails', async () => {
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
      screen.getByRole('radio', { name: 'Rate 6 out of 10' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Database unavailable',
    )
    expect(screen.getByRole('group', { name: 'Game a' })).toBeInTheDocument()
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
