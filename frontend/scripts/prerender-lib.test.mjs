import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ADMIN_ROUTES,
  LEGACY_PREFIX,
  assertDailyPool,
  clip,
  excerpt,
  legacyRoutes,
  spineFeed,
  noindex,
  publicRoutes,
  routeUrl,
  renderHead,
  robots,
  sitemap,
  strayTripDirs,
} from './prerender-lib.mjs'
import { editionPath, issuePath } from '../src/lib/spinePaths.js'
import { readPublished } from './markdown-lib.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const SHELL = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8')

const POST = {
  slug: 'how-spine-works',
  title: 'How Spine works',
  date: '2026-10-02',
  body: '## Heading\n\nSpine is the tracker behind the [shelf](/spine). It uses `code` and *emphasis*.\n\nSecond paragraph.',
}
const NOTE = {
  slug: 'a-note',
  title: 'A note',
  date: '2026-11-06',
  body: 'Render serves the slash form.\n\n```yaml\nroutes: []\n```',
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

  it('keeps code span contents as written', () => {
    expect(excerpt('The `/*` catch-all and `og_url`, with *emphasis*.')).toBe(
      'The /* catch-all and og_url, with emphasis.',
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
      '/shelf',
      '/shelf/next',
      '/shelf/how',
      '/shelf/comics',
      '/shelf/intake',
      '/now',
      '/colophon',
      '/stats',
      '/denver',
      '/daily',
      '/blog',
      '/blog/how-spine-works',
      `/shelf/${ITEM.id}`,
    ])
  })

  it('titles pages the way the app does', () => {
    expect(routeAt(routes, '/about').title).toBe('About · Joey Haas')
    expect(routeAt(routes, '/shelf/next').title).toBe('What’s next · My Shelf')
    expect(routeAt(routes, '/shelf/how').title).toBe('How it works · My Shelf')
    expect(routeAt(routes, '/shelf/comics').title).toBe('Comics · My Shelf')
    expect(routeAt(routes, '/shelf/intake').title).toBe(
      'Try the intake · My Shelf',
    )
    expect(routeAt(routes, '/blog/how-spine-works').title).toBe(
      'How Spine works · Joey Haas',
    )
    expect(routeAt(routes, `/shelf/${ITEM.id}`).title).toBe(
      'Hades II · My Shelf',
    )
  })

  it('previews an item with its cover and a plain description', () => {
    const item = routeAt(routes, `/shelf/${ITEM.id}`)
    expect(item.image.url).toBe(ITEM.cover_url)
    expect(item.description).toBe(
      'Hades II on Nintendo Switch 2, in Joey Haas’s game collection on My Shelf. Rated 9/10.',
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
      'Heat, in Joey Haas’s film collection on My Shelf.',
    )
    expect(wanted.description).toBe(
      'Pikmin 5, on Joey Haas’s want list on My Shelf.',
    )
  })

  it('lists Travel and its trips only while one is published', () => {
    const none = publicRoutes({ posts: [], notes: [], trips: [], items: [] })
    expect(none.some((route) => route.path.startsWith('/travel'))).toBe(false)
    const trip = {
      slug: 'croatia-greece-2026',
      title: 'Croatia & Greece',
      date: '2026-09-12',
      body: "## Day 1 · Arrive · Dubrovnik\n\nLanded late.\n\n![City walls](walls 'On the wall')\n",
      frontmatter: { summary: 'Twelve days, three places.', cover: 'walls' },
    }
    const routes = publicRoutes({ posts: [], trips: [trip], items: [] })
    expect(routes.length).toBe(none.length + 2)
    expect(routeAt(routes, '/travel').title).toBe('Travel · Joey Haas')
    expect(routeAt(routes, '/travel/croatia-greece-2026')).toMatchObject({
      title: 'Croatia & Greece · Travel · Joey Haas',
      description: 'Twelve days, three places.',
      type: 'article',
      lastmod: '2026-09-12',
      image: {
        url: 'https://joey-haas.dev/travel/croatia-greece-2026/walls-1600.webp',
        alt: 'City walls',
      },
    })
    const bare = publicRoutes({
      posts: [],
      trips: [{ ...trip, frontmatter: {} }],
      items: [],
    })
    const plain = routeAt(bare, '/travel/croatia-greece-2026')
    expect(plain.description).toBe('Landed late.')
    expect(plain.image.url).toBe('https://joey-haas.dev/og-card.png')
  })

  it('lists TIL and its notes as articles with the TIL feed', () => {
    const withNotes = publicRoutes({ posts: [], notes: [NOTE], items: [] })
    const til = routeAt(withNotes, '/til')
    const note = routeAt(withNotes, '/til/a-note')
    expect(withNotes.map((route) => route.path).slice(-2)).toEqual([
      '/til',
      '/til/a-note',
    ])
    expect(til.title).toBe('TIL · Joey Haas')
    expect(til.feed.href).toBe('/til/feed.xml')
    expect(note).toMatchObject({
      title: 'A note · TIL · Joey Haas',
      description: 'Render serves the slash form.',
      type: 'article',
      lastmod: '2026-11-06',
    })
    expect(note.feed.href).toBe('/til/feed.xml')
    expect(renderHead(SHELL, note)).toContain(
      'type="application/rss+xml" title="TIL · Joey Haas" href="/til/feed.xml"',
    )
  })

  it('leaves out TIL with no note published', () => {
    expect(routes.map((route) => route.path)).not.toContain('/til')
  })

  it('leaves out Blog with nothing published, and items without an id', () => {
    const bare = publicRoutes({ posts: [], items: [{ title: 'No id' }] })
    expect(bare.map((route) => route.path)).not.toContain('/blog')
    expect(bare).toHaveLength(13)
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

  // renderHead replaces the shell's tags, so its defaults are what ships:
  // they must say what index.html says.
  it('gives the home page the shell’s description and image alt', () => {
    const shellContent = (attr) =>
      SHELL.match(new RegExp(`${attr}"\\s+content="([^"]*)"`))[1]
    const home = renderHead(
      SHELL,
      routeAt(publicRoutes({ posts: [], items: [] }), '/'),
    )
    expect(home).toContain(`content="${shellContent('name="description')}"`)
    expect(home).toContain(
      `content="${shellContent('property="og:image:alt')}"`,
    )
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
      `/shelf/${ITEM.id}`,
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
    expect(urls[`/shelf/${ITEM.id}`]).toBe(
      `https://joey-haas.dev/shelf/${ITEM.id}/`,
    )
    expect(urls['/shelf/year/2026']).toBe(
      'https://joey-haas.dev/shelf/year/2026/',
    )
    expect(urls['/shelf/journal/2026-09']).toBe(
      'https://joey-haas.dev/shelf/journal/2026-09/',
    )
    expect(urls['/']).toBe('https://joey-haas.dev/')
    expect(urls['/shelf']).toBe('https://joey-haas.dev/shelf')
    expect(urls['/shelf/next']).toBe('https://joey-haas.dev/shelf/next')
    expect(urls['/blog/how-spine-works']).toBe(
      'https://joey-haas.dev/blog/how-spine-works',
    )
    const head = renderHead(SHELL, routeAt(routes, `/shelf/${ITEM.id}`))
    const url = `https://joey-haas.dev/shelf/${ITEM.id}/`
    expect(head).toContain(`<link rel="canonical" href="${url}" />`)
    expect(head).toContain(`<meta property="og:url" content="${url}" />`)
    expect(sitemap(routes)).toContain(`<loc>${url}</loc>`)
  })
})

describe('comic issue and edition pages', () => {
  const SAGA = '6f1c2c1e-0000-4000-8000-0000000000aa'
  const COMIC_ISSUES = [
    {
      item_id: SAGA,
      series_title: 'Saga',
      issues: [
        { number: 58, name: 'Chapter 58', cover_url: 'https://cv.test/58.jpg' },
        { number: 59, name: null, cover_url: null },
      ],
      editions: [
        {
          slug: 'ed-55-60',
          label: 'Volume Ten',
          cover_url: 'https://cv.test/v10.jpg',
        },
        { slug: 'ed-1-6', label: 'Deluxe', cover_url: 'http://cv.test/x.jpg' },
      ],
    },
  ]
  const routes = publicRoutes({
    posts: [],
    items: [ITEM],
    comicIssues: COMIC_ISSUES,
  })

  it('emits an issue page with its cover, slash form and no /spine mirror', () => {
    const page = routeAt(routes, `/shelf/${SAGA}/58`)
    expect(page.title).toBe('Saga #58 · My Shelf')
    expect(page.slash).toBe(true)
    expect(page.legacy).toBeUndefined()
    expect(page.image).toEqual({
      url: 'https://cv.test/58.jpg',
      alt: 'Cover of Saga #58',
    })
    expect(page.description).toContain('Saga #58')
    expect(routeUrl(page)).toBe(`https://joey-haas.dev/shelf/${SAGA}/58/`)
    expect(legacyRoutes(routes).map((r) => r.path)).not.toContain(
      `/spine/${SAGA}/58`,
    )
  })

  it('falls back to the site card without an https cover', () => {
    const bare = routeAt(routes, `/shelf/${SAGA}/59`)
    const insecure = routeAt(routes, `/shelf/${SAGA}/ed-1-6`)
    expect(bare.image.url).toMatch(/og-card/)
    expect(insecure.image.url).toBe(bare.image.url)
  })

  it('emits an edition page titled by series and label', () => {
    const page = routeAt(routes, `/shelf/${SAGA}/ed-55-60`)
    expect(page.title).toBe('Saga, Volume Ten · My Shelf')
    expect(page.slash).toBe(true)
    expect(page.image.url).toBe('https://cv.test/v10.jpg')
    expect(renderHead(SHELL, page)).toContain(
      `<link rel="canonical" href="https://joey-haas.dev/shelf/${SAGA}/ed-55-60/" />`,
    )
  })

  it('has the URLs the SPA links to, for an id that needs encoding', () => {
    const id = 'a b/ü'
    const rows = publicRoutes({
      posts: [],
      items: [],
      comicIssues: [
        {
          item_id: id,
          series_title: 'Odd',
          issues: [{ number: 7, name: null, cover_url: null }],
          editions: [{ slug: 'ed-1-6', label: 'One', cover_url: null }],
        },
      ],
    })
    const [issue, edition] = rows.filter((r) => r.path.startsWith('/shelf/a'))
    expect(routeUrl(issue)).toBe(`https://joey-haas.dev${issuePath(id, 7)}`)
    expect(routeUrl(edition)).toBe(
      `https://joey-haas.dev${editionPath(id, 'ed-1-6')}`,
    )
  })

  it('lists them in the sitemap like item pages', () => {
    expect(sitemap(routes)).toContain(
      `<loc>https://joey-haas.dev/shelf/${SAGA}/58/</loc>`,
    )
  })

  it('adds nothing without a comic-issues snapshot', () => {
    const none = publicRoutes({ posts: [], items: [ITEM] })
    expect(none.map((r) => r.path)).toEqual(
      publicRoutes({ posts: [], items: [ITEM], comicIssues: [] }).map(
        (r) => r.path,
      ),
    )
    expect(none.some((r) => r.path.startsWith(`/shelf/${SAGA}`))).toBe(false)
    expect(() =>
      publicRoutes({ posts: [], items: [], comicIssues: null }),
    ).not.toThrow()
  })

  it('skips malformed rows without crashing', () => {
    const bad = publicRoutes({
      posts: [],
      items: [],
      comicIssues: [
        null,
        { item_id: SAGA },
        { series_title: 'No id', issues: [{ number: 1 }] },
        { item_id: SAGA, series_title: 'Saga', issues: [{ number: 'x' }, {}] },
      ],
    })
    expect(bad.some((r) => r.path.startsWith(`/shelf/${SAGA}`))).toBe(false)
  })
})

describe('strayTripDirs', () => {
  it('names every travel folder that is not a published trip', () => {
    // A draft's built photos are copied from public/ like any other file;
    // only a published trip's folder may stay in dist.
    expect(
      strayTripDirs(
        ['lisbon-2019', 'croatia-greece-2026', 'ireland-2014'],
        [{ slug: 'lisbon-2019' }],
      ),
    ).toEqual(['croatia-greece-2026', 'ireland-2014'])
  })

  it('keeps everything when every folder is published', () => {
    expect(strayTripDirs(['lisbon-2019'], [{ slug: 'lisbon-2019' }])).toEqual(
      [],
    )
  })
})

describe('legacyRoutes', () => {
  const routes = publicRoutes({
    posts: [],
    items: [{ ...ITEM, finished_at: '2026-09-01' }],
  })
  const legacy = legacyRoutes(routes)

  it('writes the shelf, What’s next, How it works and items at /spine', () => {
    expect(legacy.map((route) => route.path)).toEqual([
      LEGACY_PREFIX,
      `${LEGACY_PREFIX}/next`,
      `${LEGACY_PREFIX}/how`,
      `${LEGACY_PREFIX}/${ITEM.id}`,
    ])
  })

  it('points the canonical URL and og:url at /shelf', () => {
    const route = legacy.find((entry) => entry.path.endsWith(ITEM.id))
    const head = renderHead(SHELL, route)
    const url = `https://joey-haas.dev/shelf/${ITEM.id}/`
    expect(head).toContain(`<link rel="canonical" href="${url}" />`)
    expect(head).toContain(`<meta property="og:url" content="${url}" />`)
    expect(head).toContain('<title>Hades II · My Shelf</title>')
    expect(head).not.toContain('/spine/')
  })

  it('stays out of the sitemap', () => {
    expect(sitemap(routes)).not.toContain('/spine')
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
    expect(xml.match(/<url>/g)).toHaveLength(16)
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
      'My Shelf: finished games',
      'Finished Newer',
      'Finished Older',
    ])
    expect(xml).toContain(
      '<description>Newer (Nintendo Switch 2, rated 9/10).</description>',
    )
    expect(xml).toContain('<link>https://joey-haas.dev/shelf/b/</link>')
  })

  it('keeps each GUID on the pre-rename item URL', () => {
    // What a /spine build wrote, so no reader sees an entry again as new.
    const xml = spineFeed([
      { ...ITEM, id: 'a b', title: 'Spaced', finished_at: '2026-03-01' },
    ])
    expect(xml).toContain(
      '<guid isPermaLink="false">https://joey-haas.dev/spine/a%20b/#finished-2026-03-01</guid>',
    )
    expect(xml).toContain(
      '<atom:link href="https://joey-haas.dev/shelf/feed.xml" rel="self"',
    )
  })

  it('writes one entry per finish, a replay as a new one', () => {
    const xml = spineFeed([
      {
        ...ITEM,
        id: 'r',
        title: 'Dredge',
        finished_at: '2026-10-19',
        finishes: ['2024-03-01', '2026-10-19'],
        times_completed: 2,
      },
    ])
    const titles = [...xml.matchAll(/<title>([^<]*)<\/title>/g)].map(
      ([, title]) => title,
    )
    expect(titles.slice(1)).toEqual([
      'Finished Dredge again',
      'Finished Dredge',
    ])
    // The first finish keeps the GUID it was published under.
    expect(xml).toContain(
      '<guid isPermaLink="false">https://joey-haas.dev/spine/r/#finished-2024-03-01</guid>',
    )
    expect(xml).toContain(
      '<guid isPermaLink="false">https://joey-haas.dev/spine/r/#finished-2026-10-19</guid>',
    )
  })

  it('is announced in the head of /shelf and /now', () => {
    const routes = publicRoutes({ posts: [], items: [] })
    const head = renderHead(SHELL, routeAt(routes, '/now'))
    expect(head).toContain('href="/shelf/feed.xml"')
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
      '/shelf/year/2026',
      '/shelf/year/2025',
    ])
    expect(years[0].title).toBe('2026 in review · My Shelf')
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
      '/shelf/journal/2026-09',
      '/shelf/journal/2025-12',
    ])
    expect(months[0].title).toBe('September 2026 · My Shelf')
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
      '<loc>https://joey-haas.dev/shelf/journal/2026-09/</loc>',
    )
  })
})

// What the build publishes, read the way prerender.mjs reads it.
const publishedPosts = await readPublished(path.join(here, '..', 'posts'))
const publishedNotes = await readPublished(path.join(here, '..', 'notes'))
const publishedTrips = await readPublished(path.join(here, '..', 'trips'))

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
  const built = publicRoutes({
    posts: publishedPosts,
    notes: publishedNotes,
    trips: publishedTrips,
    items: [],
    comicIssues: [
      {
        item_id: 'abc',
        series_title: 'Saga',
        issues: [{ number: 1, name: null, cover_url: null }],
        editions: [{ slug: 'ed-1-2', label: 'Volume One', cover_url: null }],
      },
    ],
  })
  // Slash pages (item, year, month, issue, edition) stay on the catch-all.
  const pages = [...built, ...legacyRoutes(built)]
    .filter((route) => !route.slash)
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

  it('rewrites the intake demo ahead of the catch-all (AC 18)', () => {
    expect(rules).toContainEqual({
      source: '/shelf/intake',
      destination: '/shelf/intake/index.html',
    })
    expect(rules.findIndex((rule) => rule.source === '/shelf/intake')).toBe(
      rules.findIndex((rule) => rule.source === '/shelf/comics') + 1,
    )
  })

  it('keeps the SPA catch-all last', () => {
    expect(rules.at(-1)).toEqual({ source: '/*', destination: '/index.html' })
  })
})

describe('assertDailyPool', () => {
  const game = (id) => ({
    id,
    type: 'game',
    title: `Game ${id}`,
    platform: 'Nintendo Switch',
    year: 2020,
    genres: ['Platform'],
    time_to_beat_hours: 10,
  })
  const games = (count) => Array.from({ length: count }, (_, i) => game(i + 1))

  it('passes at the floor and reports the pool size', () => {
    expect(assertDailyPool(games(30))).toBe(30)
  })

  it('stops the build one game under the floor', () => {
    expect(() => assertDailyPool(games(29))).toThrow(/29 eligible games/)
  })

  it('counts only eligible games', () => {
    const items = [...games(29), { ...game(99), time_to_beat_hours: null }]
    expect(() => assertDailyPool(items)).toThrow(/29 eligible/)
  })
})

describe('an empty page (#183)', () => {
  const hidden = publicRoutes({ posts: [], items: [], hidden: ['/denver'] })

  it('gets noindex in its head and nowhere else', () => {
    const shell = '<html><head><title>x</title></head><body></body></html>'
    const html = (route) => renderHead(shell, route)
    expect(html(routeAt(hidden, '/denver'))).toContain(
      '<meta name="robots" content="noindex" />',
    )
    expect(html(routeAt(hidden, '/about'))).not.toContain('noindex')
  })

  it('stays out of the sitemap, still prerendered', () => {
    expect(hidden.map((r) => r.path)).toContain('/denver')
    expect(sitemap(hidden)).not.toContain('/denver')
    expect(sitemap(hidden)).toContain('/about')
  })

  it('changes nothing when no path is hidden', () => {
    const plain = publicRoutes({ posts: [], items: [] })
    expect(plain.some((r) => r.noindex)).toBe(false)
    expect(sitemap(plain)).toContain('/denver')
  })
})
