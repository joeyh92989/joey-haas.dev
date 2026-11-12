import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Home from './Home.jsx'

const content = vi.hoisted(() => ({ posts: [] }))
vi.mock('../content/posts.js', () => content)
const changes = vi.hoisted(() => ({ CHANGELOG: [] }))
vi.mock('../content/changelog.js', () => changes)
const tripContent = vi.hoisted(() => ({ trips: [] }))
vi.mock('../content/trips.js', () => tripContent)
const snapshots = vi.hoisted(() => ({ items: null }))
vi.mock('../lib/snapshot.js', () => ({
  readSnapshot: vi.fn(async (name) => snapshots[name]),
}))

const POST = {
  slug: 'how-spine-works',
  frontmatter: {
    title: 'How Spine works',
    date: '2026-10-02',
    summary: 'What it is, and the one rule.',
  },
}

const entry = (lines) => ({ date: '2026-10-02', lines })

function game(id, fields) {
  return { id, type: 'game', title: `Game ${id}`, wanted: false, ...fields }
}

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  )
}

function facts() {
  return Object.fromEntries(
    [...document.querySelectorAll('.facts > div')].map((row) => [
      row.querySelector('dt').textContent,
      row.querySelector('dd').textContent,
    ]),
  )
}

afterEach(() => {
  content.posts.length = 0
  changes.CHANGELOG.length = 0
  tripContent.trips.length = 0
  snapshots.items = null
})

describe('Home', () => {
  it('reads the headline once, as one sentence', () => {
    renderHome()
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Shipping software since 2012, from roadmap to production.',
      }),
    ).toBeInTheDocument()
  })

  it('offers About, My Shelf, and GitHub', () => {
    renderHome()
    expect(screen.getByRole('link', { name: 'About me' })).toHaveAttribute(
      'href',
      '/about',
    )
    expect(screen.getByRole('link', { name: 'See My Shelf' })).toHaveAttribute(
      'href',
      '/shelf',
    )
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/joeyh92989',
    )
  })

  it('lists the profile facts, without Last shipped or Playing when there are none', async () => {
    snapshots.items = [game('1', { status: 'backlog' })]
    renderHome()
    await screen.findByRole('heading', { name: 'Work' })
    expect(Object.keys(facts())).toEqual(['Now', 'Focus', 'Stack'])
  })

  it('reads Last shipped from the newest changelog entry, named by its first link', () => {
    changes.CHANGELOG.push(
      entry(['The [shelf](/shelf) pages say when they cannot load.']),
    )
    renderHome()
    expect(facts()['Last shipped']).toBe('My Shelf · Oct 2')
    expect(
      screen.getByRole('link', { name: 'My Shelf · Oct 2' }),
    ).toHaveAttribute('href', '/stats#changes')
  })

  it('cuts a plain Last shipped at a word and keeps it on one line', () => {
    changes.CHANGELOG.push(
      entry([
        'Links inside running text are now underlined, so they can be told apart.',
      ]),
    )
    renderHome()
    const text = facts()['Last shipped']
    expect(text).toBe('Links inside running text are now underlined… · Oct 2')
    expect(
      screen.getByRole('link', { name: /Links inside/ }).closest('dd'),
    ).toHaveClass('facts-one-line')
  })

  it('adds what is being played from the snapshot', async () => {
    snapshots.items = [
      game('1', { title: 'Dredge', status: 'active' }),
      game('2', { title: 'Hades', status: 'backlog' }),
    ]
    renderHome()
    expect(await screen.findByText('Dredge')).toBeInTheDocument()
    expect(facts().Playing).toBe('Dredge')
  })

  it('links the work cards, and keeps their text off the accent', () => {
    content.posts.push(POST)
    renderHome()
    const work = within(
      screen.getByRole('region', { name: 'Work' }),
    ).getAllByRole('link')
    expect(work.map((link) => link.getAttribute('href'))).toEqual([
      '/projects',
      '/shelf',
      '/colophon',
      '/blog/how-spine-works',
    ])
    for (const card of document.querySelectorAll('.card')) {
      expect(card.querySelector('[class*="accent"]')).toBeNull()
    }
    expect(
      screen.getByText('What it is, and the one rule.'),
    ).toBeInTheDocument()
  })

  it('adds the newest trip as Latest trip, with a Travel card', () => {
    tripContent.trips.push({
      slug: 'croatia-greece-2026',
      frontmatter: {
        title: 'Croatia & Greece',
        date: '2026-09-12',
        end: '2026-09-23',
        precision: 'day',
        summary: 'Twelve days, three places.',
        places: [],
      },
      days: [],
      cover: null,
    })
    renderHome()
    expect(facts()['Latest trip']).toBe('Croatia & Greece · Sept 2026')
    const card = screen.getByRole('link', { name: /Croatia & Greece/ })
    expect(card).toHaveAttribute('href', '/travel/croatia-greece-2026')
    expect(within(card).getByText('Twelve days, three places.')).toBeVisible()
  })

  it('has no writing card while nothing is published', () => {
    renderHome()
    expect(document.querySelectorAll('.card')).toHaveLength(2)
  })

  it('folds the roles before Guild into one experience row', () => {
    renderHome()
    const rows = within(
      screen.getByRole('region', { name: 'Experience' }),
    ).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows[2]).toHaveTextContent('2012 – 2019')
    expect(rows[2]).toHaveTextContent('MJ Freeway · Charter · iBAHN — Product')
  })
})
