import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Home from './Home.jsx'

const content = vi.hoisted(() => ({ posts: [] }))
vi.mock('../content/posts.js', () => content)
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
  snapshots.items = null
})

describe('Home', () => {
  it('reads the headline once, as one sentence', () => {
    renderHome()
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Backend systems where correctness and money are the same problem.',
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
      '/spine',
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

  it('adds the newest post as Last shipped', () => {
    content.posts.push(POST)
    renderHome()
    expect(facts()['Last shipped']).toBe('How Spine works · Oct 2')
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
      '/spine',
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
