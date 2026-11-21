import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { profile } from '../content/profile.js'
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
  slug: 'how-my-shelf-works',
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
    [...document.querySelectorAll('.glance-facts > div')].map((row) => [
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
  it('opens with the name as the one h1', () => {
    renderHome()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Joey Haas' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('sets the name as plain text in the h1', () => {
    renderHome()
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent(/^Joey Haas$/)
    expect(h1.children).toHaveLength(0)
  })

  it('reads the headline once, as a paragraph under the name, not a heading', () => {
    renderHome()
    expect(typeof profile.headline).toBe('string')
    const sub = screen.getByText('Building software since 2012.')
    expect(sub.tagName).toBe('P')
    expect(sub.children).toHaveLength(0)
    expect(
      screen.queryByRole('heading', { name: /Building software/ }),
    ).toBeNull()
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(
      h1.compareDocumentPosition(sub) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('keeps the kicker above the name and the lede after the subline', () => {
    renderHome()
    const kicker = screen.getByText(profile.tagline)
    const h1 = screen.getByRole('heading', { level: 1 })
    const sub = screen.getByText(profile.headline)
    const lede = screen.getByText(profile.lede)
    const follows = (a, b) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(kicker, h1)).toBe(true)
    expect(follows(h1, sub)).toBe(true)
    expect(follows(sub, lede)).toBe(true)
  })

  it('keeps the heading order: one h1, then h2s, no skipped level', () => {
    renderHome()
    const levels = screen
      .getAllByRole('heading')
      .map((h) => Number(h.tagName[1]))
    expect(levels[0]).toBe(1)
    levels.slice(1).forEach((level, i) => {
      expect(level).toBeLessThanOrEqual(levels[i] + 1)
    })
  })

  it('draws the hero actions as design-system buttons, not .btn', () => {
    renderHome()
    const actions = document.querySelector('.hero-actions')
    expect(actions.querySelector('.btn')).toBeNull()
    const links = within(actions).getAllByRole('link')
    expect(links).toHaveLength(6)
    const [primary, ...rest] = links
    expect(primary).toHaveTextContent('About me')
    expect(primary.className).toMatch(/\bbg-primary\b/)
    expect(primary.className).not.toMatch(/bg-primary!|bg-transparent/)
    // Every other action is the bordered outline button: none is a
    // borderless, padded text link (GitHub and LinkedIn included).
    for (const link of rest) {
      expect(link.className).toMatch(/\bborder-foreground\b/)
      expect(link.className).not.toMatch(/border-transparent/)
    }
    for (const link of links) {
      expect(link.className).toMatch(/focus-visible:outline-solid/)
    }
  })

  it('lets the whole Work card answer hover, and puts no underline hover on the title', () => {
    renderHome()
    const work = screen.getByRole('region', { name: 'Work' })
    const [card] = work.querySelectorAll('[data-slot="card"]')
    expect(card.className).toMatch(/has-\[a:hover\]:border/)
    const link = within(card).getByRole('link', { name: 'My Shelf' })
    expect(link.className).not.toMatch(/hover:underline/)
  })

  it('keeps the At a glance heading out of an inline span', () => {
    renderHome()
    const glance = screen.getByRole('complementary', { name: 'At a glance' })
    const heading = within(glance).getByRole('heading', { level: 2 })
    expect(heading.closest('span')).toBeNull()
    expect(glance.querySelector('[data-strip] > span:empty')).toBeNull()
    expect(glance.className + glance.innerHTML).not.toMatch(
      /first-child\]:hidden/,
    )
  })

  it('shows At a glance as a record card with its own heading', () => {
    renderHome()
    const glance = screen.getByRole('complementary', { name: 'At a glance' })
    expect(
      within(glance).getByRole('heading', { level: 2, name: 'At a glance' }),
    ).toBeInTheDocument()
    expect(glance.querySelector('[data-strip]')).not.toBeNull()
    expect(glance.querySelector('dl.glance-facts')).not.toBeNull()
  })

  it('numbers the Work records, decoratively, in order', () => {
    content.posts.push(POST)
    renderHome()
    const work = screen.getByRole('region', { name: 'Work' })
    const items = within(work).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    items.forEach((item, i) => {
      const number = item.querySelector('[data-strip] [aria-hidden="true"]')
      expect(number).toHaveTextContent(`No. 00${i + 1}`)
    })
  })

  it('marks the shelf record live, with the word beside the mark', () => {
    renderHome()
    const work = screen.getByRole('region', { name: 'Work' })
    const [shelf] = within(work).getAllByRole('listitem')
    expect(shelf.querySelector('[data-filled="true"]')).not.toBeNull()
    expect(within(shelf).getByText('live')).toBeInTheDocument()
  })

  it('lists experience as an ordered list of dated rows', () => {
    renderHome()
    const experience = screen.getByRole('region', { name: 'Experience' })
    expect(experience.querySelector('ol')).not.toBeNull()
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

  it('puts LinkedIn beside GitHub as an equal button', () => {
    renderHome()
    const actions = document.querySelector('.hero-actions')
    const github = within(actions).getByRole('link', { name: /GitHub/ })
    const linkedin = within(actions).getByRole('link', { name: /LinkedIn/ })
    expect(linkedin).toHaveAttribute('href', profile.linkedin)
    expect(linkedin.className).toBe(github.className)
    expect(linkedin.getAttribute('rel')).toBe(github.getAttribute('rel'))
    expect(linkedin.getAttribute('target')).toBe(github.getAttribute('target'))
    expect(github.nextElementSibling).toBe(linkedin)
  })

  it('words the Work link for the projects page, not a long list', () => {
    renderHome()
    const work = screen.getByRole('region', { name: 'Work' })
    expect(
      within(work).getByRole('link', { name: 'Project details' }),
    ).toHaveAttribute('href', '/projects')
    expect(within(work).queryByText(/All projects/)).toBeNull()
  })

  it('shows the public figures in the Guild row and links About', () => {
    renderHome()
    const experience = screen.getByRole('region', { name: 'Experience' })
    expect(experience).toHaveTextContent('$1B')
    expect(experience).toHaveTextContent('55–74%')
    expect(
      within(experience).getByRole('link', { name: /Full history/ }),
    ).toHaveAttribute('href', '/about')
  })

  it('lists the profile facts, without Last shipped or Playing when there are none', async () => {
    snapshots.items = [game('1', { status: 'backlog' })]
    renderHome()
    await screen.findByRole('heading', { name: 'Work' })
    expect(Object.keys(facts())).toEqual(['Now', 'Focus', 'Stack'])
  })

  it('dates Last shipped from the newest changelog entry, linking to the changes', () => {
    changes.CHANGELOG.push(entry(['The [shelf](/shelf) pages load faster.']))
    renderHome()
    expect(facts()['Last shipped']).toBe('Oct 2')
    expect(screen.getByRole('link', { name: 'Oct 2' })).toHaveAttribute(
      'href',
      '/stats#changes',
    )
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
      '/blog/how-my-shelf-works',
    ])
    for (const card of document.querySelectorAll('[data-slot="card"]')) {
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
    expect(
      within(card.closest('li')).getByText('Twelve days, three places.'),
    ).toBeVisible()
  })

  it('has no writing card while nothing is published', () => {
    renderHome()
    const work = screen.getByRole('region', { name: 'Work' })
    expect(within(work).getAllByRole('listitem')).toHaveLength(2)
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

  it('ends with how to reach me, built from the profile', () => {
    renderHome()
    expect(screen.getByRole('link', { name: profile.email })).toHaveAttribute(
      'href',
      `mailto:${profile.email}`,
    )
    const contact = screen.getByRole('region', { name: 'Contact' })
    expect(
      within(contact).getByRole('link', { name: 'LinkedIn' }),
    ).toHaveAttribute('href', profile.linkedin)
    expect(screen.getByRole('link', { name: 'PDF' })).toHaveAttribute(
      'href',
      '/resume.pdf',
    )
  })
})
