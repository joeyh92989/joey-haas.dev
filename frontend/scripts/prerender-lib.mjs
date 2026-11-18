/**
 * Pure helpers for scripts/prerender.mjs and scripts/generate-rss.mjs: the
 * public routes, each route's head, the post excerpt, the sitemap and
 * robots.txt. No file or network access here, so tests drive them directly.
 */
import { staticPages, TIL_PAGE, TRAVEL_PAGE } from '../src/content/pages.js'
import { profile } from '../src/content/profile.js'
import { spine } from '../src/content/spine.js'
import {
  finishMonths,
  monthInReview,
  monthName,
} from '../src/lib/monthInReview.js'
import { MIN_POOL, dailyPool } from '../src/lib/daily.js'
import { finishDates, finishRows } from '../src/lib/finishes.js'
import { clip } from '../src/lib/clip.js'
import { isHiddenPath } from '../src/lib/snapshotPresence.js'
import { issuePath, itemPath, volumePath } from '../src/lib/spinePaths.js'
import {
  finishYears,
  ownedFinishes,
  yearInReview,
} from '../src/lib/yearInReview.js'

export const SITE_URL = 'https://joey-haas.dev'

const DEFAULT_IMAGE = {
  url: `${SITE_URL}/og-card.png`,
  width: 1200,
  height: 630,
  alt: 'Joey Haas, senior software engineer, and My Shelf, a tracker for his physical game collection.',
}

/**
 * A generated card (og-card.mjs) for a post, note or trip, written to
 * dist/og/<kind>/<slug>.png by prerender.mjs. The route keeps `ogCard` so the
 * build knows what to draw, and `useFallbackImage` puts the site card back
 * when the drawing fails, so a link preview never points at a missing file.
 */
export function ogCardFile(kind, slug) {
  return `og/${kind}/${slug}.png`
}

function ogCardImage(kind, slug, title, what) {
  return {
    url: `${SITE_URL}/${ogCardFile(kind, encodeURIComponent(slug))}`,
    width: 1200,
    height: 630,
    alt: `${title}, ${what} on joey-haas.dev`,
  }
}

export function useFallbackImage(route) {
  const fallback = { ...route, image: DEFAULT_IMAGE }
  delete fallback.ogCard
  return fallback
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
  '/admin/jobs',
  '/admin/shelf/games',
  '/admin/shelf/comics',
  '/admin/collection/add',
  '/admin/play-next',
  '/admin/catalogue',
  '/admin/radar',
  '/admin/pull-list',
  '/admin/discover',
  '/admin/store-list',
  '/admin/spots',
  '/admin/weekend',
  '/admin/closet',
  '/admin/closet/profile',
  '/admin/closet/today',
  '/admin/closet/review',
  '/admin/closet/add',
  '/admin/places/add',
]

/**
 * The tracker's path before it moved to /shelf. Links already shared to
 * /spine, /spine/next, /spine/how and /spine/<id>/ keep their previews
 * through legacyRoutes(), and feed GUIDs stay on it so readers do not see
 * every entry again.
 */
export const LEGACY_PREFIX = '/spine'

/** Spine's finishes feed, announced in the head of the pages that show them. */
const SPINE_FEED = {
  href: `${spine.path}/feed.xml`,
  title: `${spine.name}: finished games`,
}

/** The blog feed, announced on every page, as the shell always did. */
const BLOG_FEED = {
  href: '/feed.xml',
  title: profile.name,
}

/** The TIL feed, announced in the head of the notes pages. */
const TIL_FEED = {
  href: '/til/feed.xml',
  title: `TIL · ${profile.name}`,
}

// Re-exported: the clip rule moved to src/lib/clip.js so the static pages'
// descriptions (src/content/pages.js) are clipped where they are written.
export { clip }

/** Escapes text for an HTML attribute or element body. */
/**
 * Shelfle's pool floor (daily puzzle spec): with fewer than MIN_POOL
 * eligible games the answers repeat too often to be a puzzle, so a build
 * from such a snapshot stops rather than shipping one. Returns the pool's
 * size for the build log. Only called when the build has a snapshot.
 */
export function assertDailyPool(items) {
  const size = dailyPool(items).length
  if (size < MIN_POOL) {
    throw new Error(
      `prerender: Shelfle's pool has ${size} eligible games, under the floor of ${MIN_POOL}. Publish more games with a platform, year, genre and time to beat, or lower MIN_POOL in src/lib/daily.js.`,
    )
  }
  return size
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * A post's or note's first paragraph as plain text: links keep their words,
 * code spans keep their contents (`/*` stays /*) and emphasis marks go. Headings, lists and code blocks are skipped, since the
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
      // Odd pieces of the split are code spans, kept as written.
      .split(/`([^`]*)`/)
      .map((piece, index) =>
        index % 2 === 1 ? piece : piece.replace(/[`*_]/g, ''),
      )
      .join(''),
  )
}

/**
 * A trip's link-preview image: its cover, built at 1600 wide, with the alt
 * the cover has where the trip's markdown places it. The default card when
 * the trip names no cover.
 */
function tripImage(trip) {
  const cover = trip.frontmatter?.cover
  if (!cover) return DEFAULT_IMAGE
  const placed = [...trip.body.matchAll(/!\[([^\]]*)\]\(\s*([^\s)'"]+)/g)].find(
    ([, , name]) => name === cover,
  )
  return {
    url: `${SITE_URL}/travel/${trip.slug}/${cover}-1600.webp`,
    alt: placed?.[1] || `A photo from ${trip.title}`,
  }
}

/** Home's structured data: the person and the site, as one graph. */
function homeJsonLd() {
  const person = `${SITE_URL}/#person`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': person,
        name: profile.name,
        url: SITE_URL,
        jobTitle: 'Senior Software Engineer',
        sameAs: [profile.github, profile.linkedin].filter(Boolean),
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: profile.name,
        url: SITE_URL,
        author: { '@id': person },
      },
    ],
  }
}

/** A post's structured data. */
function postJsonLd(post, url, description) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description,
    url,
    mainEntityOfPage: url,
    ...(/^\d{4}-\d{2}-\d{2}$/.test(post.date)
      ? { datePublished: post.date }
      : {}),
    author: { '@type': 'Person', name: profile.name, url: SITE_URL },
  }
}

/** The latest of some YYYY-MM-DD dates, or nothing. */
const latest = (dates) =>
  dates
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? ''))
    .sort()
    .pop()

/** An item's sitemap date: its latest finish, else the day it was added. */
function itemDate(item) {
  return (
    latest(finishDates(item)) ??
    latest([
      typeof item.created_at === 'string' ? item.created_at.slice(0, 10) : '',
    ])
  )
}

/**
 * What a comic title's link preview says after its name: ": a line of 3
 * books", ": a single book", ": 2 books and 5 issues". A run, a row missing
 * from the index (or from before it had a kind) and a kind this build does
 * not know say nothing, so the text stays what it was.
 *
 * @param {{kind?: string, issues?: unknown[], volumes?: unknown[]}} [row]
 *   The title's comic-issues index row.
 * @returns {string}
 */
export function comicLead(row) {
  const say = spine.comics.books.preview
  const books = Array.isArray(row?.volumes) ? row.volumes.length : 0
  const issues = Array.isArray(row?.issues) ? row.issues.length : 0
  if (row?.kind === 'book_line') return `: ${say.book_line(books)}`
  if (row?.kind === 'single_book') return `: ${say.single_book()}`
  if (row?.kind === 'both') return `: ${say.both(books, issues)}`
  return ''
}

/**
 * The name each item is titled by: its title, and where two rows share one,
 * qualified by year, then platform, then creator, then a short id, so no two
 * pages share a <title> (#268). Only colliding rows change.
 *
 * @param {object[]} items
 * @returns {Map<string, string>} id to display title.
 */
export function itemLabels(items) {
  const valid = items.filter((item) => item?.id != null && item.title)
  const labels = new Map()
  const picks = [(i) => i.year, (i) => i.platform, (i) => i.creator]
  for (const [title, group] of Map.groupBy(valid, (item) => item.title)) {
    if (group.length === 1) {
      labels.set(group[0].id, title)
      continue
    }
    // The fewest qualifiers that tell every row apart; all of them if none do.
    const label = (item, count) => {
      const parts = picks
        .slice(0, count)
        .map((pick) => pick(item))
        .filter(Boolean)
      return parts.length ? `${title} (${parts.join(', ')})` : title
    }
    let count = 1
    while (
      count < picks.length &&
      new Set(group.map((item) => label(item, count))).size < group.length
    ) {
      count += 1
    }
    const text = group.map((item) => label(item, count))
    group.forEach((item, i) => {
      const clash = text.indexOf(text[i]) !== text.lastIndexOf(text[i])
      labels.set(
        item.id,
        clash
          ? `${title} (${[...picks.map((pick) => pick(item)).filter(Boolean), String(item.id).slice(0, 8)].join(', ')})`
          : text[i],
      )
    })
  }
  return labels
}

/**
 * Every public route and its head. Items come from the build-time snapshot,
 * which holds public items only, so nothing private can be prerendered.
 *
 * @param {object} input
 * @param {{slug: string, title: string, date: string, body: string}[]} input.posts
 *   Published posts.
 * @param {{slug: string, title: string, date: string, body: string}[]} [input.notes]
 *   Published TIL notes.
 * @param {{slug: string, title: string, date: string, body: string,
 *   frontmatter: object}[]} [input.trips] Published trips.
 * @param {object[]} input.items The snapshot's public items.
 * @param {object[]} [input.comicIssues] The comic-issues snapshot: per public
 *   series, the issues and volumes (books) that have a page. Absent or empty adds
 *   no pages.
 * @param {string[]} [input.hidden] Static paths whose page has nothing on it
 *   (#183): marked `noindex`, so the head says so and the sitemap skips them.
 * @returns {{path: string, title: string, description: string,
 *   type: string, image: object, lastmod?: string, slash?: boolean,
 *   legacy?: boolean}[]}
 *   `legacy` marks a page that also had a /spine URL; see legacyRoutes().
 */
export function publicRoutes({
  posts,
  notes = [],
  trips = [],
  items,
  comicIssues = [],
  hidden = [],
}) {
  const page = (path, title, description) => ({
    path,
    title,
    description,
    type: 'website',
    image: DEFAULT_IMAGE,
  })
  // Pages with a feed link or a pre-rename /spine head; see legacyRoutes().
  const flags = {
    // /shelf is a client redirect to Games until the grouped Shelf page
    // exists, so its head names Games as the canonical page.
    [spine.path]: {
      feed: SPINE_FEED,
      legacy: true,
      canonical: `${SITE_URL}${spine.games.path}`,
    },
    [spine.games.path]: { feed: SPINE_FEED },
    [spine.next.path]: { legacy: true },
    [spine.how.path]: { legacy: true },
    '/now': { feed: SPINE_FEED },
    '/': { jsonLd: homeJsonLd() },
    '/blog': { feed: BLOG_FEED },
  }
  const routes = staticPages(posts.length > 0).map((entry) => ({
    ...page(entry.path, entry.headTitle, entry.description),
    ...flags[entry.path],
    ...(isHiddenPath(entry.path, hidden) ? { noindex: true } : {}),
  }))
  // The sitemap wants W3C dates; anything else is left out, not passed on.
  const lastmod = (date) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) ? { lastmod: date } : {}
  for (const post of posts) {
    const description = excerpt(post.body)
    routes.push({
      ...page(
        `/blog/${post.slug}`,
        `${post.title} · ${profile.name}`,
        description,
      ),
      type: 'article',
      image: ogCardImage('blog', post.slug, post.title, 'a post'),
      ogCard: {
        kind: 'blog',
        slug: post.slug,
        title: post.title,
        date: post.date,
      },
      jsonLd: postJsonLd(
        post,
        `${SITE_URL}/blog/${encodeURIComponent(post.slug)}`,
        description,
      ),
      ...lastmod(post.date),
    })
  }
  if (notes.length > 0) {
    routes.push({
      ...page(TIL_PAGE.path, TIL_PAGE.headTitle, TIL_PAGE.description),
      feed: TIL_FEED,
    })
  }
  for (const note of notes) {
    routes.push({
      ...page(
        `/til/${note.slug}`,
        `${note.title} · TIL · ${profile.name}`,
        excerpt(note.body),
      ),
      type: 'article',
      image: ogCardImage('til', note.slug, note.title, 'a TIL note'),
      ogCard: {
        kind: 'til',
        slug: note.slug,
        title: note.title,
        date: note.date,
      },
      feed: TIL_FEED,
      ...lastmod(note.date),
    })
  }
  // /travel and its trips exist only while one is published (D10). A trip's
  // description is its summary: its body starts with a day's prose.
  if (trips.length > 0) {
    routes.push(
      page(TRAVEL_PAGE.path, TRAVEL_PAGE.headTitle, TRAVEL_PAGE.description),
    )
  }
  for (const trip of trips) {
    const summary = trip.frontmatter?.summary
    routes.push({
      ...page(
        `/travel/${trip.slug}`,
        `${trip.title} · Travel · ${profile.name}`,
        summary ? clip(String(summary)) : excerpt(trip.body),
      ),
      type: 'article',
      // A trip with a cover photo previews as that photo; the card is for
      // one without.
      ...(trip.frontmatter?.cover
        ? { image: tripImage(trip) }
        : {
            image: ogCardImage('travel', trip.slug, trip.title, 'a trip'),
            ogCard: {
              kind: 'travel',
              slug: trip.slug,
              title: trip.title,
              date: trip.date,
            },
          }),
      ...lastmod(trip.date),
    })
  }
  const labels = itemLabels(items)
  const seriesDate = new Map()
  // A comic title's kind and counts, from the comic-issues index rows.
  const titles = new Map(
    (Array.isArray(comicIssues) ? comicIssues : [])
      .filter((row) => row?.item_id)
      .map((row) => [row.item_id, row]),
  )
  for (const item of items) {
    if (item?.id == null || !item.title) continue
    const label = labels.get(item.id)
    const date = itemDate(item)
    seriesDate.set(item.id, { label, date })
    const where = item.platform ? ` on ${item.platform}` : ''
    const rated = item.rating != null ? ` Rated ${item.rating}/10.` : ''
    const kind = ITEM_KINDS[item.type] ?? 'collection'
    const place = item.wanted
      ? `on ${profile.name}’s want list`
      : `in ${profile.name}’s ${kind}`
    const lead = item.type === 'comic' ? comicLead(titles.get(item.id)) : ''
    routes.push({
      ...page(
        `${spine.path}/${encodeURIComponent(item.id)}`,
        `${label} · ${spine.name}`,
        `${item.title}${lead}${where}, ${place} on ${spine.name}.${rated}`,
      ),
      slash: true,
      legacy: true,
      ...(date ? { lastmod: date } : {}),
      image: item.cover_url?.startsWith('https://')
        ? { url: item.cover_url, alt: `Cover of ${item.title}` }
        : DEFAULT_IMAGE,
    })
  }
  // Issue and volume pages of public comic series (the old `ed-*` edition
  // URLs are volumes that kept their slug). Like item pages they stay
  // on the catch-all (slash form only), and they had no /spine URL, so no
  // `legacy` mirror.
  for (const series of Array.isArray(comicIssues) ? comicIssues : []) {
    if (!series?.item_id || !series.series_title) continue
    const known = seriesDate.get(series.item_id)
    const seriesName = known?.label ?? series.series_title
    const seriesMod = known?.date ? { lastmod: known.date } : {}
    // The SPA's own builders, minus the slash `slash: true` puts back.
    const bare = (path) => path.slice(0, -1)
    const cover = (url, alt) =>
      typeof url === 'string' && url.startsWith('https://')
        ? { url, alt }
        : DEFAULT_IMAGE
    for (const issue of series.issues ?? []) {
      if (!Number.isInteger(issue?.number)) continue
      const label = `${seriesName} #${issue.number}`
      const named = issue.name ? `, “${issue.name}”` : ''
      routes.push({
        ...page(
          bare(issuePath(series.item_id, issue.number)),
          `${label} · ${spine.name}`,
          `${label}${named}, from ${profile.name}’s comic shelf on ${spine.name}.`,
        ),
        slash: true,
        ...seriesMod,
        image: cover(issue.cover_url, `Cover of ${label}`),
      })
    }
    for (const volume of series.volumes ?? []) {
      if (!volume?.slug || !volume.label) continue
      const label = `${seriesName}, ${volume.label}`
      const kinds = spine.comics.volume.kinds
      const format = (kinds[volume.kind] ?? volume.kind ?? 'book').toLowerCase()
      const number = Number.isInteger(volume.line_number)
        ? `, ${spine.comics.volume.number(volume.line_number)}`
        : ''
      const article = kinds[volume.kind] ? 'a ' : ''
      routes.push({
        ...page(
          bare(volumePath(series.item_id, volume.slug)),
          `${label} · ${spine.name}`,
          `${label}: ${article}${format}${number}, from ${profile.name}’s comic shelf on ${spine.name}.`,
        ),
        slash: true,
        ...seriesMod,
        image: cover(volume.cover_url, `Cover of ${label}`),
      })
    }
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
      ...lastmod(
        latest(
          ownedFinishes(items)
            .map((row) => row.finished_at)
            .filter((d) => d.startsWith(`${year}-`)),
        ),
      ),
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
      ...lastmod(latest(finished.map((row) => row.finished_at))),
    })
  }
  return routes
}

/**
 * The folders under `dist/travel/` to delete: every one that is not a
 * published trip's. Vite copies all of `public/` into `dist/`, so a draft
 * trip's built photos would otherwise deploy at guessable URLs while its
 * page does not.
 *
 * @param {string[]} dirs The folder names in `dist/travel/`.
 * @param {{slug: string}[]} trips The published trips.
 */
export function strayTripDirs(dirs, trips) {
  const published = new Set(trips.map((trip) => trip.slug))
  return dirs.filter((dir) => !published.has(dir)).sort()
}

/**
 * The heads written at the pre-rename /spine URLs: the shelf, What's next,
 * How it works and every item page. Each is its /shelf route under the old
 * path, with the canonical URL and og:url still on /shelf, so a link shared
 * before the rename previews as the page and search engines index the new
 * URL. The app then redirects the visitor. Year and month pages had no
 * shared links worth keeping and fall to the catch-all and the redirect.
 * Not in the sitemap.
 *
 * @param {object[]} routes publicRoutes()'s entries.
 * @returns {object[]} Routes with `path` under LEGACY_PREFIX and `canonical`.
 */
export function legacyRoutes(routes) {
  return routes
    .filter((route) => route.legacy)
    .map((route) => ({
      ...route,
      path: `${LEGACY_PREFIX}${route.path.slice(spine.path.length)}`,
      canonical: route.canonical ?? routeUrl(route),
    }))
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
  const url = route.canonical ?? routeUrl(route)
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
    `<meta name="twitter:title" content="${escapeHtml(route.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(route.description)}" />`,
  )
  if (route.noindex) lines.push('<meta name="robots" content="noindex" />')
  // The blog feed rides on every page, as the shell's own tag did; a page's
  // own feed comes after it.
  const feeds = [BLOG_FEED]
  if (route.feed && route.feed.href !== BLOG_FEED.href) feeds.push(route.feed)
  for (const feed of feeds) {
    lines.push(
      `<link rel="alternate" type="application/rss+xml" title="${escapeHtml(feed.title)}" href="${escapeHtml(feed.href)}" />`,
    )
  }
  if (route.jsonLd) {
    // `<` would let a title close the script element.
    const json = JSON.stringify(route.jsonLd).replace(/</g, '\\u003c')
    lines.push(`<script type="application/ld+json">${json}</script>`)
  }
  return lines.join('\n    ')
}

const SHELL_TAGS = [
  /<title>[\s\S]*?<\/title>\s*/,
  /<meta\s[^>]*name="description"[^>]*>\s*/g,
  /<meta\s[^>]*property="og:[^"]*"[^>]*>\s*/g,
  /<meta\s[^>]*name="twitter:[^"]*"[^>]*>\s*/g,
  /<link\s[^>]*rel="canonical"[^>]*>\s*/g,
  /<link\s[^>]*rel="alternate"[^>]*>\s*/g,
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
 * /shelf/feed.xml: the most recent finishes, newest first, one entry per
 * finished playthrough, so a replay is a new entry. Built from the
 * snapshot's public items, so it says nothing the shelf does not. The build
 * also writes the same body at /spine/feed.xml, the URL already in
 * subscribers' readers.
 *
 * @param {object[]} items The snapshot's public items.
 * @returns {string}
 */
export function spineFeed(items) {
  const finished = items
    // Games only, as the channel says; the shelf also holds films and comics.
    .filter((item) => item?.type === 'game' && !item.wanted)
    .filter((item) => item.id != null && item.title)
    .flatMap(finishRows)
    .sort((a, b) => b.finished_at.localeCompare(a.finished_at))
    .slice(0, FEED_SIZE)
  const entries = finished
    .map((item) => {
      const url = `${SITE_URL}${itemPath(item.id)}`
      // Fixed to the pre-rename item URL: a reader keys entries on the GUID,
      // so moving it to /shelf would show all twenty again as new.
      const guid = `${SITE_URL}${LEGACY_PREFIX}/${encodeURIComponent(item.id)}/#finished-${item.finish_tag}`
      const details = [
        item.platform,
        item.rating != null ? `rated ${item.rating}/10` : null,
      ]
        .filter(Boolean)
        .join(', ')
      return `    <item>
      <title>${escapeHtml(`Finished ${item.title}${item.again ? ' again' : ''}`)}</title>
      <link>${escapeHtml(url)}</link>
      <guid isPermaLink="false">${escapeHtml(guid)}</guid>
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

/** Turns a changelog line's markdown links into their words. */
const plainLine = (line) =>
  line.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '')

/**
 * /changelog.xml: one item per changelog day, newest first, the day's lines as
 * its text. The GUID is the day, which is unique in the file (the parser
 * refuses a repeat).
 *
 * @param {{date: string, lines: string[]}[]} entries parseChangelog()'s output.
 * @returns {string}
 */
export function changelogFeed(entries) {
  const items = entries
    .slice(0, FEED_SIZE)
    .map(
      (entry) => `    <item>
      <title>${escapeHtml(`Changes on ${entry.date}`)}</title>
      <link>${SITE_URL}/stats</link>
      <guid isPermaLink="false">${SITE_URL}/stats#changes-${entry.date}</guid>
      <pubDate>${new Date(`${entry.date}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${escapeHtml(entry.lines.map(plainLine).join('\n'))}</description>
    </item>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(`Changes · ${profile.name}`)}</title>
    <link>${SITE_URL}/stats</link>
    <description>${escapeHtml(`What changed on joey-haas.dev, from the changelog on /stats.`)}</description>
    <language>en-us</language>
    <atom:link href="${SITE_URL}/changelog.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`
}

/** sitemap.xml for the public routes. */
export function sitemap(routes) {
  const entries = routes
    // Canonical URLs only: a page that names another page as its canonical
    // (/shelf, a client redirect to Games) is that page's, not its own.
    .filter((route) => !route.noindex && !route.canonical)
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
