import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { certifications } from '../content/education.js'
import { profile } from '../content/profile.js'
import About from './About.jsx'
import Blog from './Blog.jsx'
import BlogPost from './BlogPost.jsx'
import Colophon from './Colophon.jsx'
import Now from './Now.jsx'
import Projects from './Projects.jsx'
import Til from './Til.jsx'
import TilNote from './TilNote.jsx'

// Prose pages on the design system (#531): record cards for collections,
// badges for chips, serif section heads, and the whole-card link's inset
// ring. The look is pinned by the classes the primitives put on the page.

const snapshots = vi.hoisted(() => ({ items: null, next: null, meta: null }))
vi.mock('../lib/snapshot.js', () => ({
  readSnapshot: vi.fn(async (name) => snapshots[name]),
}))

vi.mock('../content/posts.js', () => {
  const posts = [
    {
      slug: 'newer',
      frontmatter: {
        title: 'Newer post',
        date: '2026-10-02',
        tags: ['react', 'css'],
        draft: true,
        summary: 'What it is, in a line.',
      },
      html: '<p>Body.</p>',
      headings: Array.from({ length: 5 }, (_, i) => ({
        id: `part-${i + 1}`,
        text: `Part ${i + 1}`,
      })),
    },
    {
      slug: 'older',
      frontmatter: { title: 'Older post', date: '2026-09-01', tags: [] },
      html: '<p>Body.</p>',
    },
  ]
  return {
    posts,
    findPost: (slug) => posts.find((post) => post.slug === slug),
  }
})

vi.mock('../content/notes.js', () => {
  const notes = [
    {
      slug: 'newer-note',
      frontmatter: {
        title: 'Newer note',
        date: '2026-11-06',
        tags: ['render'],
        draft: true,
      },
      html: '<p>Newer body.</p>',
    },
    {
      slug: 'older-note',
      frontmatter: { title: 'Older note', date: '2026-10-01', tags: [] },
      html: '<p>Older body.</p>',
    },
  ]
  return {
    notes,
    findNote: (slug) => notes.find((note) => note.slug === slug),
  }
})

const inRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

/** A record card's strip text with its catalogue number. */
const number = (card) => card.querySelector('[data-strip]')?.textContent ?? ''

const BADGE = /\brounded-sm\b/
const BADGE_BORDER = /\bborder-line-card\b/

/** The heading style every prose section uses: serif, with a rule under it. */
function expectSectionHead(heading) {
  expect(heading.className).toMatch(/\bfont-heading\b/)
  expect(heading.className).toMatch(/\bborder-b\b/)
}

describe('Projects on the design system', () => {
  it('draws each project as a numbered record card', () => {
    const { container } = inRouter(<Projects />)
    const cards = [...container.querySelectorAll('.project-card')]
    expect(cards.length).toBeGreaterThan(1)
    cards.forEach((card, i) => {
      expect(card).toHaveAttribute('data-slot', 'card')
      expect(number(card)).toContain(`No. ${String(i + 1).padStart(3, '0')}`)
      const no = card.querySelector('[data-strip] [aria-hidden="true"]')
      expect(no).toHaveTextContent(/^No\. 00\d$/)
    })
  })

  it('puts the tagline on the card strip, not above the title', () => {
    const { container } = inRouter(<Projects />)
    const tagline = container.querySelector('.project-tagline')
    expect(tagline.closest('[data-strip]')).not.toBeNull()
  })

  it('draws each tech entry in the badge look (squared, 1px card-line outline)', () => {
    const { container } = inRouter(<Projects />)
    const chips = container.querySelectorAll('.tech-list li')
    expect(chips.length).toBeGreaterThan(0)
    for (const chip of chips) {
      expect(chip.className).toMatch(BADGE)
      expect(chip.className).toMatch(BADGE_BORDER)
    }
  })

  it('sets the page title and project names in the serif', () => {
    const { container } = inRouter(<Projects />)
    expect(screen.getByRole('heading', { level: 1 }).className).toMatch(
      /\bfont-heading\b/,
    )
    for (const h2 of container.querySelectorAll('h2')) {
      expect(h2.className).toMatch(/\bfont-heading\b/)
    }
  })
})

describe('Review fixes', () => {
  it('ties a project\u2019s tagline to its article, which the strip sits outside', () => {
    const { container } = inRouter(<Projects />)
    const article = container.querySelector('.project-card article')
    const id = article.getAttribute('aria-describedby')
    expect(id).toBeTruthy()
    const tagline = container.querySelector('.project-tagline')
    expect(tagline.id).toBe(id)
    expect(tagline.closest('[data-strip]')).not.toBeNull()
  })

  it('says what the site is styled with, without the old no-framework line', () => {
    inRouter(<Colophon />)
    expect(screen.queryByText(/no CSS framework/)).toBeNull()
    expect(screen.getByText(/Tailwind/)).toBeInTheDocument()
  })

  it('rules Now\u2019s lists once: the heading has the rule, the first row has none above it', async () => {
    snapshots.items = [
      {
        id: '2',
        type: 'game',
        title: 'Game 2',
        wanted: false,
        status: 'paused',
        paused_on: '2026-10-01',
        finished_at: null,
      },
      {
        id: '3',
        type: 'game',
        title: 'Game 3',
        wanted: false,
        status: 'finished',
        finished_at: '2026-11-01',
      },
    ]
    inRouter(<Now />)
    for (const name of ['Game 2', 'Game 3']) {
      const row = (await screen.findByRole('link', { name })).closest('li')
      expect(row.className).not.toMatch(/first:border-t|\bborder-t\b/)
      expect(row.className).toMatch(/\bborder-b\b/)
    }
    snapshots.items = null
  })
})

describe('Narrow-screen details', () => {
  it('keeps the catalogue number on one line so a long tagline wraps beside it', () => {
    const { container } = inRouter(<Projects />)
    const no = container.querySelector('[data-strip] [aria-hidden="true"]')
    expect(no.className).toMatch(/\bwhitespace-nowrap\b/)
  })

  it('keeps a space before a project link arrow where the link is inline-flex', () => {
    const { container } = inRouter(<Projects />)
    const arrow = container.querySelector('.project-links a span')
    expect(arrow.className).toMatch(/max-\[700px\]:ml-1/)
  })
})

describe('About on the design system', () => {
  it('holds the facts in a record card beside the title', () => {
    const { container } = inRouter(<About />)
    const card = container.querySelector('.about-aside [data-slot="card"]')
    expect(card).not.toBeNull()
    expect(within(card).getByText(profile.aboutFacts[0].label)).toBeVisible()
    expect(card.querySelector('[data-strip]')).not.toBeNull()
    // No catalogue number: the facts are not a collection.
    expect(card.querySelector('[data-strip] [aria-hidden="true"]')).toBeNull()
  })

  it('draws toolbox, certifications and awards as badges', () => {
    inRouter(<About />)
    const tool = screen.getByText(profile.toolbox[0])
    expect(tool.className).toMatch(BADGE)
    const cert = screen.getByText(certifications[0])
    expect(cert.className).toMatch(BADGE)
  })

  it('heads each section with the serif rule, not a mono kicker', () => {
    inRouter(<About />)
    for (const name of [
      'Summary',
      'Experience',
      'Education',
      'Areas of expertise',
      'Toolbox',
    ]) {
      const heading = screen.getByRole('heading', { level: 2, name })
      expectSectionHead(heading)
      expect(heading.className).not.toMatch(/about-label/)
    }
  })

  it('lists expertise without the legacy list class', () => {
    const { container } = inRouter(<About />)
    expect(container.querySelector('.expertise-list')).toBeNull()
    const first = screen.getByText(profile.expertise[0])
    expect(first.className).toMatch(/\bborder-l-2\b/)
  })
})

describe('Now and Colophon on the design system', () => {
  it('heads Colophon sections with the serif rule', () => {
    inRouter(<Colophon />)
    for (const name of ['Architecture', 'Frontend', 'Backend', 'Hosting']) {
      expectSectionHead(screen.getByRole('heading', { level: 2, name }))
    }
    expect(screen.getByRole('heading', { level: 1 }).className).toMatch(
      /\bfont-heading\b/,
    )
  })

  it('titles Now in the serif and sets each section off with the rule', async () => {
    const game = (id, fields) => ({
      id,
      type: 'game',
      title: `Game ${id}`,
      wanted: false,
      cover_url: null,
      finished_at: null,
      rating: null,
      ...fields,
    })
    snapshots.items = [
      game('1', { status: 'active' }),
      game('2', { status: 'paused', paused_on: '2026-10-01' }),
      game('3', {
        status: 'finished',
        finished_at: '2026-11-01',
        finish_number: 1,
      }),
    ]
    snapshots.next = { tonight: { up_next: { item_id: '9', title: 'Pinned' } } }
    snapshots.meta = { fetched_at: '2026-11-02T00:00:00Z' }
    inRouter(<Now />)
    expect(screen.getByRole('heading', { level: 1 }).className).toMatch(
      /\bfont-heading\b/,
    )
    for (const name of ['Playing', 'Paused', 'Up next', 'Recently finished']) {
      expectSectionHead(await screen.findByRole('heading', { level: 2, name }))
    }
    // Up next is a record card without a catalogue number: not a collection.
    const card = screen
      .getByRole('link', { name: 'Pinned' })
      .closest('[data-slot="card"]')
    expect(card).not.toBeNull()
    expect(card.querySelector('[aria-hidden="true"]')).toBeNull()
    // Paused and finished rows are ruled rows, not the legacy bare list.
    for (const link of [
      screen.getByRole('link', { name: 'Game 2' }),
      screen.getByRole('link', { name: 'Game 3' }),
    ]) {
      expect(link.closest('li').className).toMatch(/\bborder-b\b/)
    }
  })
})

describe('Blog on the design system', () => {
  it('draws each post as a numbered record card with its date on the strip', () => {
    inRouter(<Blog />)
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    rows.forEach((row, i) => {
      const card = row.querySelector('[data-slot="card"]')
      expect(card).not.toBeNull()
      expect(number(card)).toContain(`No. ${String(i + 1).padStart(3, '0')}`)
      expect(card.querySelector('[data-strip] time')).not.toBeNull()
    })
  })

  it('covers the whole card with the title link, ringed inside the card', () => {
    inRouter(<Blog />)
    const [row] = screen.getAllByRole('listitem')
    const card = row.querySelector('[data-slot="card"]')
    expect(card.className).toMatch(/\brelative\b/)
    const link = within(row).getByRole('link', { name: 'Newer post' })
    expect(link.className).toMatch(/after:absolute/)
    expect(link.className).toMatch(/after:inset-0/)
    // Inset, because the card clips an outward ring.
    expect(link.className).toMatch(/focus-visible:after:-outline-offset-2/)
    expect(link.className).toMatch(/focus-visible:after:outline-solid/)
    expect(link.className).not.toMatch(/hover:underline/)
  })

  it('marks a draft with a badge beside the title, outside the heading text', () => {
    inRouter(<Blog />)
    const badge = screen.getByText('Draft')
    expect(badge.className).toMatch(BADGE)
    expect(
      screen.getByRole('heading', { level: 2, name: 'Newer post' }),
    ).toBeInTheDocument()
  })
})

describe('Til on the design system', () => {
  it('draws each note as a numbered record card around its article', () => {
    inRouter(<Til />)
    const articles = screen.getAllByRole('article')
    expect(articles).toHaveLength(2)
    articles.forEach((article, i) => {
      const card = article.closest('[data-slot="card"]')
      expect(card).not.toBeNull()
      expect(number(card)).toContain(`No. ${String(i + 1).padStart(3, '0')}`)
    })
  })

  it('draws a draft mark and tags as badges', () => {
    inRouter(<Til />)
    expect(screen.getByText('Draft').className).toMatch(BADGE)
    expect(screen.getByText('render').className).toMatch(BADGE)
  })
})

describe('Post and note pages on the design system', () => {
  const post = (slug) =>
    render(
      <MemoryRouter initialEntries={[`/blog/${slug}`]}>
        <Routes>
          <Route path="/blog/:slug" element={<BlogPost />} />
        </Routes>
      </MemoryRouter>,
    )

  it('draws tags and the draft mark as badges', () => {
    post('newer')
    expect(screen.getByText('react').className).toMatch(BADGE)
    expect(screen.getByText('Draft').className).toMatch(BADGE)
  })

  it('draws the contents list as a record card with its label on the strip', () => {
    post('newer')
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    const card = nav.closest('[data-slot="card"]')
    expect(card).not.toBeNull()
    expect(card.querySelector('[data-strip]')).toHaveTextContent('On this page')
    // Not a collection: no catalogue number.
    expect(card.querySelector('[data-strip] [aria-hidden="true"]')).toBeNull()
  })

  it('draws a note page with badges', () => {
    render(
      <MemoryRouter initialEntries={['/til/newer-note']}>
        <Routes>
          <Route path="/til/:slug" element={<TilNote />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('render').className).toMatch(BADGE)
  })
})
