import matter from 'gray-matter'
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
  routeUrl,
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

  it('gives item, year and month pages their slash URL, and nothing else', () => {
    const routes = publicRoutes({
      posts: [POST],
      items: [{ ...ITEM, finished_at: '2026-09-14' }],
    })
    const urls = Object.fromEntries(
      routes.map((route) => [route.path, routeUrl(route)]),
    )
    expect(urls[`/spine/${ITEM.id}`]).toBe(
      `https://joey-haas.dev/spine/${ITEM.id}/`,
    )
    expect(urls['/spine/year/2026']).toBe(
      'https://joey-haas.dev/spine/year/2026/',
    )
    expect(urls['/spine/journal/2026-09']).toBe(
      'https://joey-haas.dev/spine/journal/2026-09/',
    )
    expect(urls['/']).toBe('https://joey-haas.dev/')
    expect(urls['/spine']).toBe('https://joey-haas.dev/spine')
    expect(urls['/spine/next']).toBe('https://joey-haas.dev/spine/next')
    expect(urls['/blog/how-spine-works']).toBe(
      'https://joey-haas.dev/blog/how-spine-works',
    )
    const head = renderHead(SHELL, routeAt(routes, `/spine/${ITEM.id}`))
    const url = `https://joey-haas.dev/spine/${ITEM.id}/`
    expect(head).toContain(`<link rel="canonical" href="${url}" />`)
    expect(head).toContain(`<meta property="og:url" content="${url}" />`)
    expect(sitemap(routes)).toContain(`<loc>${url}</loc>`)
  })
})

describe('ADMIN_ROUTES', () => {
  // A new admin page in App.jsx without a row here would be indexable.
  it('lists every fixed admin path in App.jsx', () => {
    const app = fs.readFileSync(path.join(here, '..', 'src', 'App.jsx'), 'utf8')
    // The admin pages are nested under AdminLayout's route: its index is
    // /admin, and each fixed child path joins onto it. The block ends at the
    // </Route> indented as its opening tag, so a nested group cannot end it.
    const admin = app.match(/^( *)<Route path="admin"[\s\S]*?^\1<\/Route>/m)
    expect(admin, 'the admin route block in App.jsx').not.toBeNull()
    // Its children, without the opening tag's own path="admin".
    const block = admin[0].slice(admin[0].indexOf('\n'))
    const children = [...block.matchAll(/<Route path="([^":*]+)"/g)].map(
      ([, route]) => `/admin/${route}`,
    )
    const paths = block.includes('<Route index')
      ? ['/admin', ...children]
      : children
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
      {
        ...ITEM,
        id: 'd',
        title: 'A film',
        type: 'movie',
        finished_at: '2026-09-01',
      },
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
    expect(xml).toContain('<link>https://joey-haas.dev/spine/b/</link>')
  })

  it('is announced in the head of /spine and /now', () => {
    const routes = publicRoutes({ posts: [], items: [] })
    const head = renderHead(SHELL, routeAt(routes, '/now'))
    expect(head).toContain('href="/spine/feed.xml"')
  })
})

describe('year in review routes', () => {
  it('adds a page per year with a finish', () => {
    const routes = publicRoutes({
      posts: [],
      items: [
        { ...ITEM, id: 'a', finished_at: '2026-03-01' },
        { ...ITEM, id: 'b', finished_at: '2026-09-30' },
        { ...ITEM, id: 'c', finished_at: '2025-12-01' },
        { ...ITEM, id: 'd', finished_at: '2024-01-01', wanted: true },
      ],
    })
    const years = routes.filter((route) => route.path.includes('/year/'))
    expect(years.map((route) => route.path)).toEqual([
      '/spine/year/2026',
      '/spine/year/2025',
    ])
    expect(years[0].title).toBe('2026 in review · Spine')
    expect(years[0].description.startsWith('2 games finished in 2026')).toBe(
      true,
    )
  })
})

describe('journal month routes', () => {
  it('adds a page per month with a finish', () => {
    const routes = publicRoutes({
      posts: [],
      items: [
        { ...ITEM, id: 'a', finished_at: '2026-09-01' },
        { ...ITEM, id: 'b', finished_at: '2026-09-30' },
        { ...ITEM, id: 'c', finished_at: '2025-12-01' },
        { ...ITEM, id: 'd', finished_at: '2024-01-01', wanted: true },
      ],
    })
    const months = routes.filter((route) => route.path.includes('/journal/'))
    expect(months.map((route) => route.path)).toEqual([
      '/spine/journal/2026-09',
      '/spine/journal/2025-12',
    ])
    expect(months[0].title).toBe('September 2026 · Spine')
    expect(
      months[0].description.startsWith('2 games finished in September 2026'),
    ).toBe(true)
    expect(months[1].description.startsWith('1 game finished')).toBe(true)
  })

  it('lists the month pages in the sitemap', () => {
    const routes = publicRoutes({
      posts: [],
      items: [{ ...ITEM, id: 'a', finished_at: '2026-09-01' }],
    })
    expect(sitemap(routes)).toContain(
      '<loc>https://joey-haas.dev/spine/journal/2026-09/</loc>',
    )
  })
})

describe('render.yaml rewrites', () => {
  // Render serves dist/x/index.html at /x/ but not at /x, so each prerendered
  // page needs its own rewrite ahead of the SPA catch-all. A rewrite to a
  // file the build did not write serves an empty 200, so every rule must
  // name a page this build writes: no placeholders, and a post's rule comes
  // and goes with the post. Item, year and month pages stay on the catch-all.
  const yaml = fs.readFileSync(
    path.join(here, '..', '..', 'render.yaml'),
    'utf8',
  )
  const rules = [
    ...yaml.matchAll(/- type: rewrite\s+source: (\S+)\s+destination: (\S+)/g),
  ].map(([, source, destination]) => ({ source, destination }))
  const postsDir = path.join(here, '..', 'posts')
  const posts = fs
    .readdirSync(postsDir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({
      slug: name.replace(/\.md$/, ''),
      ...matter(fs.readFileSync(path.join(postsDir, name), 'utf8')),
    }))
    .filter(({ data }) => data.draft !== true)
    .map(({ slug, data, content }) => ({
      slug,
      title: String(data.title),
      date: String(data.date),
      body: content,
    }))
  const pages = publicRoutes({ posts, items: [] })
    .map((route) => route.path)
    .filter((route) => route !== '/')

  it('rewrites exactly the pages this build writes, each to its own file', () => {
    const rewrites = rules.slice(0, -1)
    expect(rewrites.map((rule) => rule.source).sort()).toEqual(
      [...pages].sort(),
    )
    for (const rule of rewrites) {
      expect(rule.destination).toBe(`${rule.source}/index.html`)
    }
  })

  it('keeps the SPA catch-all last', () => {
    expect(rules.at(-1)).toEqual({ source: '/*', destination: '/index.html' })
  })
})
