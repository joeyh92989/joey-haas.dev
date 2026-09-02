import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MetadataPicker from './MetadataPicker.jsx'

const CANDIDATE = {
  external_source: 'tmdb',
  external_id: '438631',
  title: 'Dune',
  year: 2021,
  thumbnail_url: 'https://image.tmdb.org/t/p/w185/x.jpg',
}

function stubFetch(response) {
  const mock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('MetadataPicker', () => {
  it('searches and lists candidates with their year', async () => {
    stubFetch({ ok: true, status: 200, json: async () => [CANDIDATE] })
    render(<MetadataPicker type="movie" onSelect={() => {}} />)

    await userEvent.type(screen.getByLabelText(/look up/i), 'Dune')

    expect(await screen.findByText(/Dune \(2021\)/)).toBeInTheDocument()
  })

  it('hands the whole candidate to onSelect', async () => {
    stubFetch({ ok: true, status: 200, json: async () => [CANDIDATE] })
    const onSelect = vi.fn()
    render(<MetadataPicker type="movie" onSelect={onSelect} />)

    await userEvent.type(screen.getByLabelText(/look up/i), 'Dune')
    await userEvent.click(await screen.findByRole('button', { name: /Dune/ }))

    expect(onSelect).toHaveBeenCalledWith(CANDIDATE)
  })

  it('explains an unconfigured source instead of showing an empty list', async () => {
    // 503 means the key is missing on this deploy. "No matches" would send
    // the reader hunting for a spelling mistake that is not there.
    stubFetch({
      ok: false,
      status: 503,
      json: async () => ({ detail: 'tmdb: TMDB_API_TOKEN is not set' }),
    })
    render(<MetadataPicker type="movie" onSelect={() => {}} />)

    await userEvent.type(screen.getByLabelText(/look up/i), 'Dune')

    expect(await screen.findByText(/lookup unavailable/i)).toBeInTheDocument()
  })

  it('reports a failed lookup rather than pretending there were no matches', async () => {
    stubFetch({ ok: false, status: 502, json: async () => ({}) })
    render(<MetadataPicker type="movie" onSelect={() => {}} />)

    await userEvent.type(screen.getByLabelText(/look up/i), 'Dune')

    expect(await screen.findByText(/lookup failed/i)).toBeInTheDocument()
  })

  it('says so plainly when the source returns nothing', async () => {
    stubFetch({ ok: true, status: 200, json: async () => [] })
    render(<MetadataPicker type="movie" onSelect={() => {}} />)

    await userEvent.type(screen.getByLabelText(/look up/i), 'Zzzz')

    expect(await screen.findByText(/no matches/i)).toBeInTheDocument()
  })

  it('does not search until the query is worth a request', async () => {
    const fetchMock = stubFetch({ ok: true, status: 200, json: async () => [] })
    render(<MetadataPicker type="movie" onSelect={() => {}} />)

    await userEvent.type(screen.getByLabelText(/look up/i), 'D')

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled())
  })

  it('sends the media type so the backend picks the right source', async () => {
    const fetchMock = stubFetch({
      ok: true,
      status: 200,
      json: async () => [CANDIDATE],
    })
    render(<MetadataPicker type="boardgame" onSelect={() => {}} />)

    await userEvent.type(screen.getByLabelText(/look up/i), 'Gloomhaven')

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toContain('type=boardgame')
  })
})
