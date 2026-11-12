import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Now from './Now.jsx'

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

describe('Now', () => {
  function renderPage() {
    return render(
      <MemoryRouter>
        <Now />
      </MemoryRouter>,
    )
  }

  it('lists paused games under their own heading, dated by the pause', async () => {
    snapshots.items = [
      item('1', { title: 'Hades II', status: 'active' }),
      item('2', {
        title: 'Elden Ring',
        status: 'paused',
        paused_on: '2026-08-03',
      }),
    ]
    renderPage()

    const heading = await screen.findByRole('heading', { name: 'Paused' })
    expect(heading.nextSibling).toHaveTextContent('Elden Ring · since Aug 2026')
    // Playing is active only.
    expect(
      screen.getByRole('heading', { name: 'Playing' }).parentElement,
    ).not.toHaveTextContent('Elden Ring')
  })

  it('tags a replayed finish again, saying which time', async () => {
    snapshots.items = [
      item('3', {
        title: 'Pikmin 4',
        status: 'finished',
        finished_at: '2026-09-30',
        times_completed: 2,
      }),
    ]
    renderPage()

    const heading = await screen.findByRole('heading', {
      name: 'Recently finished',
    })
    expect(heading.nextSibling).toHaveTextContent(
      'Pikmin 4 again · Sep 30, 2026 · second time',
    )
  })

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
      '/shelf/1/',
    )
    expect(
      screen.getByRole('link', { name: 'Metroid Prime 4' }),
    ).toHaveAttribute('href', '/shelf/8/')
    expect(screen.getByText(/Sep 30, 2026 · rated 9/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'RSS feed of finished games' }),
    ).toHaveAttribute('href', '/shelf/feed.xml')
  })

  it('falls back to the first Tonight pick when nothing is pinned', async () => {
    snapshots.items = [item('1', { title: 'Hades II', status: 'active' })]
    snapshots.next = {
      tonight: {
        up_next: null,
        picks: [
          { item_id: '9', title: 'Dredge', platform: 'Switch' },
          { item_id: '10', title: 'Pikmin 4', platform: null },
        ],
      },
    }
    renderPage()

    const heading = await screen.findByRole('heading', { name: 'Up next' })
    expect(heading.nextSibling).toHaveTextContent('Dredge · Switch')
    expect(screen.getByRole('link', { name: 'Dredge' })).toHaveAttribute(
      'href',
      '/shelf/9/',
    )
    expect(screen.queryByText('Pikmin 4')).not.toBeInTheDocument()
  })

  it('points to My Shelf when the build has no snapshot', async () => {
    renderPage()
    expect(await screen.findByText(/Nothing to show/)).toBeInTheDocument()
  })
})
