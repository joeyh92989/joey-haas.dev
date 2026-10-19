import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ADMIN_ROUTES,
  clip,
  excerpt,
  spineFeed,
  noindex,
  publicRoutes,
  renderHead,
  robots,
  sitemap,
} from './prerender-lib.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const SHELL = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8')

const POST = {
  slug: 'how-spine-works',
  title: 'How Spine works',
  date: '2026-10-02',
  body: '## Heading\n\nSpine is the tracker behind the [shelf](/spine). It uses `code` and *emphasis*.\n\nSecond paragraph.',
}
const ITEM = {
  type: 'game',
  id: '6f1c2c1e-0000-4000-8000-000000000001',
  title: 'Hades II',
  platform: 'Nintendo Switch 2',
  rating: 9,
  cover_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/x.jpg',
}

const routeAt = (routes, at) => routes.find((route) => route.path === at)

describe('excerpt', () => {
  it('takes the first prose paragraph as plain text', () => {
    expect(excerpt(POST.body)).toBe(
      'Spine is the tracker behind the shelf. It uses code and emphasis.',
    )
  })

  it('cuts a long paragraph at a word', () => {
    const long = 'word '.repeat(60)
    const cut = clip(long)
    expect(cut.length).toBeLessThanOrEqual(160)
    expect(cut.endsWith('word…')).toBe(true)
  })
})

describe('publicRoutes', () => {
  const routes = publicRoutes({ posts: [POST], items: [ITEM] })

  it('lists the static pages, the posts and the items', () => {
    expect(routes.map((route) => route.path)).toEqual([
      '/',
      '/about',
      '/projects',
      '/spine',
      '/spine/next',
      '/now',
      '/colophon',
      '/blog',
      '/blog/how-spine-works',
      `/spine/${ITEM.id}`,
    ])
  })

  it('titles pages the way the app does', () => {
    expect(routeAt(routes, '/about').title).toBe('About · Joey Haas')
    expect(routeAt(routes, '/spine/next').title).toBe('What’s next · Spine')
    expect(routeAt(routes, '/blog/how-spine-works').title).toBe(
      'How Spine works · Joey Haas',
    )
    expect(routeAt(routes, `/spine/${ITEM.id}`).title).toBe('Hades II · Spine')
  })

  it('previews an item with its cover and a plain description', () => {
    const item = routeAt(routes, `/spine/${ITEM.id}`)
    expect(item.image.url).toBe(ITEM.cover_url)
    expect(item.description).toBe(
      'Hades II on Nintendo Switch 2, in Joey Haas’s game collection on Spine. Rated 9/10.',
    )
  })

  it('words a film or a wanted game by what it is', () => {
    const [film, wanted] = publicRoutes({
      posts: [],
      items: [
        { id: 'f', title: 'Heat', type: 'movie' },
        { id: 'w', title: 'Pikmin 5', type: 'game', wanted: true },
      ],
    }).slice(-2)
    expect(film.description).toBe(
      'Heat, in Joey Haas’s film collection on Spine.',
    )
    expect(wanted.description).toBe(
      'Pikmin 5, on Joey Haas’s want list on Spine.',
    )
  })

  it('leaves out Blog with nothing published, and items without an id', () => {
    const bare = publicRoutes({ posts: [], items: [{ title: 'No id' }] })
    expect(bare.map((route) => route.path)).not.toContain('/blog')
    expect(bare).toHaveLength(7)
  })
})

describe('renderHead', () => {
  const [post] = publicRoutes({ posts: [POST], items: [] }).filter(
    (route) => route.path === '/blog/how-spine-works',
  )
  const html = renderHead(SHELL, post)

  it('replaces the site-wide title and preview tags with the route’s', () => {
    expect(html.match(/<title>/g)).toHaveLength(1)
    expect(html).toContain('<title>How Spine works · Joey Haas</title>')
    expect(html.match(/property="og:title"/g)).toHaveLength(1)
    expect(html).toContain('content="How Spine works · Joey Haas"')
    expect(html).toContain(
      '<link rel="canonical" href="https://joey-haas.dev/blog/how-spine-works" />',
    )
    expect(html).toContain('<meta property="og:type" content="article" />')
    expect(html.match(/name="description"/g)).toHaveLength(1)
  })

  it('keeps the rest of the shell', () => {
    expect(html).toContain('<div id="root"></div>')
    expect(html).toContain("localStorage.getItem('theme')")
    expect(html).toContain('rel="alternate"')
  })

  it('escapes what it writes', () => {
    const odd = renderHead(SHELL, {
      ...post,
      title: 'Tom & "Jerry" <3',
    })
    expect(odd).toContain('<title>Tom &amp; &quot;Jerry&quot; &lt;3</title>')
  })

  it('uses a summary card for a portrait cover', () => {
    const item = routeAt(
      publicRoutes({ posts: [], items: [ITEM] }),
      `/spine/${ITEM.id}`,
    )
    const out = renderHead(SHELL, item)
    expect(out).toContain('<meta name="twitter:card" content="summary" />')
    expect(out).not.toContain('og:image:width')
  })
})

describe('ADMIN_ROUTES', () => {
  // A new admin page in App.jsx without a row here would be indexable.
  it('lists every fixed admin path in App.jsx', () => {
    const app = fs.readFileSync(path.join(here, '..', 'src', 'App.jsx'), 'utf8')
    const paths = [...app.matchAll(/<Route path="(admin[^":]*)"/g)].map(
      ([, route]) => `/${route}`,
    )
    expect([...ADMIN_ROUTES].sort()).toEqual(paths.sort())
  })
})

describe('noindex, sitemap and robots', () => {
  it('keeps the admin out of search', () => {
    expect(noindex(SHELL)).toContain('<meta name="robots" content="noindex" />')
    expect(robots()).toContain('Disallow: /admin')
    expect(robots()).toContain('Sitemap: https://joey-haas.dev/sitemap.xml')
  })

  it('lists every route, with a post’s date', () => {
    const xml = sitemap(publicRoutes({ posts: [POST], items: [ITEM] }))
    expect(xml.match(/<url>/g)).toHaveLength(10)
    expect(xml).toContain(
      '<loc>https://joey-haas.dev/blog/how-spine-works</loc><lastmod>2026-10-02</lastmod>',
    )
  })
})

describe('spineFeed', () => {
  it('lists finishes newest first, and nothing unfinished', () => {
    const xml = spineFeed([
      { ...ITEM, id: 'a', title: 'Older', finished_at: '2026-03-01' },
      { ...ITEM, id: 'b', title: 'Newer', finished_at: '2026-09-30' },
      { ...ITEM, id: 'c', title: 'Backlog', finished_at: null },
    ])
    const titles = [...xml.matchAll(/<title>([^<]*)<\/title>/g)].map(
      ([, title]) => title,
    )
    expect(titles).toEqual([
      'Spine: finished games',
      'Finished Newer',
      'Finished Older',
    ])
    expect(xml).toContain(
      '<description>Newer (Nintendo Switch 2, rated 9/10).</description>',
    )
    expect(xml).toContain('<link>https://joey-haas.dev/spine/b</link>')
  })

  it('is announced in the head of /spine and /now', () => {
    const routes = publicRoutes({ posts: [], items: [] })
    const head = renderHead(SHELL, routeAt(routes, '/now'))
    expect(head).toContain('href="/spine/feed.xml"')
  })
})
