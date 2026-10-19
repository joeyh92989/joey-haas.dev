import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Now, { nowLists } from './Now.jsx'

const snapshots = vi.hoisted(() => ({ items: null, next: null }))
vi.mock('../lib/snapshot.js', () => ({
  readSnapshot: vi.fn(async (name) => snapshots[name]),
}))

const item = (id, fields) => ({
  id,
  type: 'game',
  title: `Game ${id}`,
  status: 'backlog',
  wanted: false,
  finished_at: null,
  rating: null,
  cover_url: null,
  ...fields,
})

afterEach(() => {
  snapshots.items = null
  snapshots.next = null
})

describe('nowLists', () => {
  it('splits playing from the most recent finishes, skipping wants', () => {
    const { playing, finished } = nowLists([
      item('1', { status: 'active' }),
      item('2', { status: 'active', wanted: true }),
      item('8', { status: 'active', type: 'movie' }),
      item('3', { status: 'finished', finished_at: '2026-01-02' }),
      item('4', { status: 'finished', finished_at: '2026-09-30' }),
      item('5', { status: 'finished', finished_at: '2026-05-01' }),
      item('6', { status: 'finished', finished_at: '2026-03-01' }),
      item('7', { status: 'finished', finished_at: '2025-12-01' }),
    ])
    expect(playing.map((row) => row.id)).toEqual(['1'])
    expect(finished.map((row) => row.id)).toEqual(['4', '5', '6', '3'])
  })
})

describe('Now', () => {
  function renderPage() {
    return render(
      <MemoryRouter>
        <Now />
      </MemoryRouter>,
    )
  }

  it('shows playing, up next and finished from the snapshots', async () => {
    snapshots.items = [
      item('1', { title: 'Hades II', status: 'active' }),
      item('3', {
        title: 'Pikmin 4',
        status: 'finished',
        finished_at: '2026-09-30',
        rating: 9,
      }),
    ]
    snapshots.next = {
      tonight: {
        up_next: { item_id: '8', title: 'Metroid Prime 4', platform: null },
      },
    }
    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Playing' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Hades II/ })).toHaveAttribute(
      'href',
      '/spine/1/',
    )
    expect(
      screen.getByRole('link', { name: 'Metroid Prime 4' }),
    ).toHaveAttribute('href', '/spine/8/')
    expect(screen.getByText(/Sep 30, 2026 · rated 9/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'finished games (RSS)' }),
    ).toHaveAttribute('href', '/spine/feed.xml')
  })

  it('points to Spine when the build has no snapshot', async () => {
    renderPage()
    expect(await screen.findByText(/Nothing to show/)).toBeInTheDocument()
  })
})
