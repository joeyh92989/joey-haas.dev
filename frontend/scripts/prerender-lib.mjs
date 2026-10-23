/**
 * Pure helpers for scripts/prerender.mjs and scripts/generate-rss.mjs: the
 * public routes, each route's head, the post excerpt, the sitemap and
 * robots.txt. No file or network access here, so tests drive them directly.
 */
import { profile } from '../src/content/profile.js'
import { spine } from '../src/content/spine.js'
import {
  finishMonths,
  monthInReview,
  monthName,
} from '../src/lib/monthInReview.js'
import { itemPath } from '../src/lib/spinePaths.js'
import { finishYears, yearInReview } from '../src/lib/yearInReview.js'

export const SITE_URL = 'https://joey-haas.dev'

const SITE_DESCRIPTION =
  'Joey Haas is a senior software engineer in Denver building payments and ledger systems, and Spine, a tracker for a physical game collection.'

const DEFAULT_IMAGE = {
  url: `${SITE_URL}/og-card.png`,
  width: 1200,
  height: 630,
  alt: 'Joey Haas, senior software engineer, and Spine, a tracker for my physical game collection.',
}

/** How an item's type reads in "in Joey Haas’s …". */
const ITEM_KINDS = {
  game: 'game collection',
  movie: 'film collection',
  comic: 'comic collection',
  boardgame: 'board game collection',
}

/**
 * The admin pages in App.jsx. Each gets a noindex copy of the shell, since
 * the home file (the SPA fallback) is indexable. robots.txt also disallows
 * /admin; this covers a crawler that reached one by a link anyway.
 */
export const ADMIN_ROUTES = [
  '/admin',
  '/admin/analytics',
  '/admin/collection',
  '/admin/import',
  '/admin/play-next',
  '/admin/catalogue',
  '/admin/radar',
  '/admin/discover',
  '/admin/store-list',
]

/** Spine's finishes feed, announced in the head of the pages that show them. */
const SPINE_FEED = {
  href: `${spine.path}/feed.xml`,
  title: `${spine.name}: finished games`,
}

/** Room for a search result snippet; longer is cut at a word. */
const DESCRIPTION_LIMIT = 160

/** Escapes text for an HTML attribute or element body. */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Cuts text at the last word that fits, with an ellipsis when cut. */
export function clip(text, limit = DESCRIPTION_LIMIT) {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= limit) return flat
  const cut = flat.slice(0, limit - 1)
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.]$/, '')}…`
}

/**
 * A post's first paragraph as plain text: links keep their words, code and
 * emphasis marks go. Headings, lists and code blocks are skipped, since the
 * first prose paragraph is what a reader would quote.
 *
 * @param {string} markdown The post body, frontmatter removed.
 * @returns {string}
 */
export function excerpt(markdown) {
  const paragraph =
    markdown
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .find((block) => block && !/^(#|```|[-*+] |\d+\. |>|<)/.test(block)) ?? ''
  return clip(
    paragraph
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[`*_]/g, ''),
  )
}

/**
 * Every public route and its head. Items come from the build-time snapshot,
 * which holds public items only, so nothing private can be prerendered.
 *
 * @param {object} input
 * @param {{slug: string, title: string, date: string, body: string}[]} input.posts
 *   Published posts.
 * @param {object[]} input.items The snapshot's public items.
 * @returns {{path: string, title: string, description: string,
 *   type: string, image: object, lastmod?: string, slash?: boolean}[]}
 */
export function publicRoutes({ posts, items }) {
  const page = (path, title, description) => ({
    path,
    title,
    description,
    type: 'website',
    image: DEFAULT_IMAGE,
  })
  const routes = [
    page(
      '/',
      `${profile.name} · Senior software engineer, Denver`,
      SITE_DESCRIPTION,
    ),
    page(
      '/about',
      `About · ${profile.name}`,
      clip(profile.bio.split('\n\n')[0]),
    ),
    page(
      '/projects',
      `Projects · ${profile.name}`,
      `What ${profile.name} builds outside work, including ${spine.name}: ${spine.projectsTagline.toLowerCase()}.`,
    ),
    {
      ...page(spine.path, `${spine.name} · ${profile.name}`, spine.tagline),
      feed: SPINE_FEED,
    },
    page(
      spine.next.path,
      `${spine.next.title} · ${spine.name}`,
      clip(spine.next.lede),
    ),
    page(
      spine.how.path,
      `${spine.tabs.how.label} · ${spine.name}`,
      spine.how.description,
    ),
    {
      ...page(
        '/now',
        `Now · ${profile.name}`,
        `What ${profile.name} is playing, what is next and what was just finished, from ${spine.name}.`,
      ),
      feed: SPINE_FEED,
    },
    page(
      '/colophon',
      `Colophon · ${profile.name}`,
      `How joey-haas.dev is built: React and Vite, FastAPI and Postgres, on Render's free tier.`,
    ),
  ]
  if (posts.length > 0) {
    routes.push(
      page('/blog', `Blog · ${profile.name}`, `Posts by ${profile.name}.`),
    )
  }
  for (const post of posts) {
    routes.push({
      ...page(
        `/blog/${post.slug}`,
        `${post.title} · ${profile.name}`,
        excerpt(post.body),
      ),
      type: 'article',
      // The sitemap wants W3C dates; anything else is left out, not passed on.
      ...(/^\d{4}-\d{2}-\d{2}$/.test(post.date) ? { lastmod: post.date } : {}),
    })
  }
  for (const item of items) {
    if (item?.id == null || !item.title) continue
    const where = item.platform ? ` on ${item.platform}` : ''
    const rated = item.rating != null ? ` Rated ${item.rating}/10.` : ''
    const kind = ITEM_KINDS[item.type] ?? 'collection'
    const place = item.wanted
      ? `on ${profile.name}’s want list`
      : `in ${profile.name}’s ${kind}`
    routes.push({
      ...page(
        `${spine.path}/${encodeURIComponent(item.id)}`,
        `${item.title} · ${spine.name}`,
        `${item.title}${where}, ${place} on ${spine.name}.${rated}`,
      ),
      slash: true,
      image: item.cover_url?.startsWith('https://')
        ? { url: item.cover_url, alt: `Cover of ${item.title}` }
        : DEFAULT_IMAGE,
    })
  }
  // One page per year with a finish, from the same pure function the page
  // uses, so the preview's count is the page's count.
  for (const year of finishYears(items)) {
    const { count } = yearInReview(items, year)
    routes.push({
      ...page(
        `${spine.path}/year/${year}`,
        `${year} in review · ${spine.name}`,
        `${count} ${count === 1 ? 'game' : 'games'} finished in ${year}: the months, the genres and every finish, from ${profile.name}’s ${spine.name}.`,
      ),
      slash: true,
      feed: SPINE_FEED,
    })
  }
  // One page per month with a finish. Months with only sessions keep the
  // SPA's head: the diary has no snapshot to build from.
  for (const month of finishMonths(items)) {
    const { finished } = monthInReview(items, [], month)
    const name = monthName(month)
    const count = finished.length
    routes.push({
      ...page(
        `${spine.path}/journal/${month}`,
        `${name} · ${spine.name}`,
        `${count} ${count === 1 ? 'game' : 'games'} finished in ${name}, and the days played, from ${profile.name}’s ${spine.name}.`,
      ),
      slash: true,
      feed: SPINE_FEED,
    })
  }
  return routes
}

/**
 * A route's public URL. Item, year and month pages (`slash`) are only served
 * prerendered at their slash form (see src/lib/spinePaths.js), so that is the
 * URL crawlers and link previews are given; every other page has a rewrite
 * for its bare form in render.yaml.
 */
export function routeUrl(route) {
  if (route.path === '/') return `${SITE_URL}/`
  return `${SITE_URL}${route.path}${route.slash ? '/' : ''}`
}

/** The head tags a route gets, replacing the shell's site-wide ones. */
export function headTags(route) {
  const url = routeUrl(route)
  const image = route.image
  const lines = [
    `<title>${escapeHtml(route.title)}</title>`,
    `<meta name="description" content="${escapeHtml(route.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:title" content="${escapeHtml(route.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(route.description)}" />`,
    `<meta property="og:type" content="${route.type}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image.url)}" />`,
  ]
  if (image.width) {
    lines.push(
      `<meta property="og:image:width" content="${image.width}" />`,
      `<meta property="og:image:height" content="${image.height}" />`,
    )
  }
  lines.push(
    `<meta property="og:image:alt" content="${escapeHtml(image.alt)}" />`,
    // A cover is portrait: the large card would crop it to a strip.
    `<meta name="twitter:card" content="${image.width ? 'summary_large_image' : 'summary'}" />`,
  )
  if (route.feed) {
    lines.push(
      `<link rel="alternate" type="application/rss+xml" title="${escapeHtml(route.feed.title)}" href="${escapeHtml(route.feed.href)}" />`,
    )
  }
  return lines.join('\n    ')
}

const SHELL_TAGS = [
  /<title>[\s\S]*?<\/title>\s*/,
  /<meta\s[^>]*name="description"[^>]*>\s*/g,
  /<meta\s[^>]*property="og:[^"]*"[^>]*>\s*/g,
  /<meta\s[^>]*name="twitter:[^"]*"[^>]*>\s*/g,
  /<link\s[^>]*rel="canonical"[^>]*>\s*/g,
]

/**
 * The built index.html with its site-wide title and preview tags replaced by
 * the route's. The body stays the SPA shell: the app renders the page.
 *
 * @param {string} html dist/index.html as Vite wrote it.
 * @param {object} route One of publicRoutes()'s entries.
 * @returns {string}
 */
export function renderHead(html, route) {
  if (!/<title>[\s\S]*?<\/title>/.test(html)) {
    throw new Error('index.html has no <title> to replace')
  }
  const marker = '<!--route-head-->'
  let out = html.replace(SHELL_TAGS[0], `${marker}\n    `)
  for (const pattern of SHELL_TAGS.slice(1)) out = out.replace(pattern, '')
  return out.replace(marker, headTags(route))
}

/** The admin shell: the same page, kept out of search results. */
export function noindex(html) {
  return html.replace(
    '</head>',
    '  <meta name="robots" content="noindex" />\n  </head>',
  )
}

const FEED_SIZE = 20

/**
 * /spine/feed.xml: the most recent finishes, newest first. Built from the
 * snapshot's public items, so it says nothing the shelf does not.
 *
 * @param {object[]} items The snapshot's public items.
 * @returns {string}
 */
export function spineFeed(items) {
  const finished = items
    // Games only, as the channel says; the shelf also holds films and comics.
    .filter((item) => item?.type === 'game' && !item.wanted)
    .filter((item) => item.id != null && item.title && item.finished_at)
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.finished_at))
    .sort((a, b) => b.finished_at.localeCompare(a.finished_at))
    .slice(0, FEED_SIZE)
  const entries = finished
    .map((item) => {
      const url = `${SITE_URL}${itemPath(item.id)}`
      const details = [
        item.platform,
        item.rating != null ? `rated ${item.rating}/10` : null,
      ]
        .filter(Boolean)
        .join(', ')
      return `    <item>
      <title>${escapeHtml(`Finished ${item.title}`)}</title>
      <link>${escapeHtml(url)}</link>
      <guid isPermaLink="false">${escapeHtml(`${url}#finished-${item.finished_at}`)}</guid>
      <pubDate>${new Date(`${item.finished_at}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${escapeHtml(details ? `${item.title} (${details}).` : `${item.title}.`)}</description>
    </item>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(`${spine.name}: finished games`)}</title>
    <link>${SITE_URL}${spine.path}</link>
    <description>${escapeHtml(`Games ${profile.name} has finished, from ${spine.name}.`)}</description>
    <language>en-us</language>
    <atom:link href="${SITE_URL}${spine.path}/feed.xml" rel="self" type="application/rss+xml"/>
${entries}
  </channel>
</rss>
`
}

/** sitemap.xml for the public routes. */
export function sitemap(routes) {
  const entries = routes
    .map((route) => {
      const lastmod = route.lastmod ? `<lastmod>${route.lastmod}</lastmod>` : ''
      return `  <url><loc>${escapeHtml(routeUrl(route))}</loc>${lastmod}</url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`
}

/** robots.txt: everything but the admin, and where the sitemap is. */
export function robots() {
  return `User-agent: *
Disallow: /admin

Sitemap: ${SITE_URL}/sitemap.xml
`
}
