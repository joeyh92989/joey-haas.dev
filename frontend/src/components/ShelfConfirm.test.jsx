import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ShelfConfirm from './ShelfConfirm.jsx'

const PREVIEW = {
  items: 1,
  playthroughs: 2,
  play_sessions: 11,
  comic_issues: 0,
  pick_events: 0,
  titles: ['Hollow Knight'],
}

function answer(body, ok = true) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 500,
      json: () => Promise.resolve(body),
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('ShelfConfirm', () => {
  it('reads the counts when it arms and names the row and what goes with it', async () => {
    const fetchMock = answer(PREVIEW)
    const onConfirm = vi.fn()
    render(
      <ShelfConfirm ids={['a']} title="Hollow Knight" onConfirm={onConfirm} />,
    )
    expect(fetchMock).not.toHaveBeenCalled()

    await userEvent.click(
      screen.getByRole('button', { name: 'Delete Hollow Knight' }),
    )

    expect(
      await screen.findByText(
        '“Hollow Knight” goes with 2 playthroughs and 11 journal days.',
      ),
    ).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toContain('/api/items/delete-preview')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ ids: ['a'] })
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete Hollow Knight for good' }),
    )
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('will not delete when the counts could not be read', async () => {
    answer({}, false)
    const onConfirm = vi.fn()
    render(<ShelfConfirm ids={['a']} title="Hades" onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete Hades' }))
    await waitFor(() =>
      expect(screen.getByText(/Couldn’t check/)).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('button', { name: 'Delete Hades for good' }),
    ).toBeDisabled()
  })

  it('words a selection with titles and totals', async () => {
    answer({
      items: 5,
      playthroughs: 3,
      play_sessions: 0,
      comic_issues: 0,
      pick_events: 0,
      titles: ['A', 'B', 'C'],
    })
    render(
      <ShelfConfirm
        many
        ids={['a', 'b']}
        title="5 items"
        label="Delete 5"
        onConfirm={() => {}}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete 5 items' }),
    )
    expect(
      await screen.findByText(
        '“A”, “B”, “C” and 2 more go with 3 playthroughs.',
      ),
    ).toBeInTheDocument()
  })

  it('says where a redo goes before it runs', async () => {
    answer(PREVIEW)
    const onConfirm = vi.fn()
    render(
      <ShelfConfirm
        mode="redo"
        ids={['a']}
        title="Hollow Knight"
        onConfirm={onConfirm}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Redo Hollow Knight' }),
    )
    expect(
      await screen.findByText(/comes back as an entry in Add to match again/),
    ).toBeInTheDocument()
    expect(screen.getByText(/goes with 2 playthroughs/)).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Yes, redo, Hollow Knight' }),
    )
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
