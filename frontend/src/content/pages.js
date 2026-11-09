/**
 * The site's static public pages: one list for the prerendered heads
 * (scripts/prerender-lib.mjs) and the search palette's Pages group.
 *
 * `title` is the short name search shows; `headTitle` is the <title> and
 * og:title the prerender writes; `description` is the meta description,
 * clipped where its source is prose rather than a one-liner (the bio's first
 * paragraph, What's next's lede). The palette truncates by CSS. A new public
 * page needs its row here and a rewrite in render.yaml (see CLAUDE.md).
 * `/blog` is only listed while there are published posts.
 */
import { clip } from '../lib/clip.js'
import { denver } from './denver.js'
import { daily } from './daily.js'
import { profile } from './profile.js'
import { spine } from './spine.js'

const SITE_DESCRIPTION =
  'Joey Haas is a senior software engineer in Denver building payments and ledger systems, and My Shelf, a tracker for his physical game collection.'

const row = (path, title, headTitle, description) => ({
  path,
  title,
  headTitle,
  description,
})

export const STATIC_PAGES = [
  row(
    '/',
    'Home',
    `${profile.name} · Senior software engineer, Denver`,
    SITE_DESCRIPTION,
  ),
  row(
    '/about',
    'About',
    `About · ${profile.name}`,
    clip(profile.bio.split('\n\n')[0]),
  ),
  row(
    '/projects',
    'Projects',
    `Projects · ${profile.name}`,
    `What ${profile.name} builds outside work, including ${spine.name}: ${spine.projectsTagline.toLowerCase()}.`,
  ),
  row(spine.path, spine.name, `${spine.name} · ${profile.name}`, spine.tagline),
  row(
    spine.next.path,
    spine.next.title,
    `${spine.next.title} · ${spine.name}`,
    clip(spine.next.lede),
  ),
  row(
    spine.how.path,
    `How ${spine.name} works`,
    `${spine.tabs.how.label} · ${spine.name}`,
    spine.how.description,
  ),
  row(
    spine.comics.path,
    spine.comics.title,
    `${spine.comics.title} · ${spine.name}`,
    spine.comics.lede,
  ),
  row(
    '/now',
    'Now',
    `Now · ${profile.name}`,
    `What ${profile.name} is playing, what is next and what was just finished, from ${spine.name}.`,
  ),
  row(
    '/colophon',
    'Colophon',
    `Colophon · ${profile.name}`,
    `How joey-haas.dev is built: React and Vite, FastAPI and Postgres, on Render's free tier.`,
  ),
  row(
    '/stats',
    'Stats',
    `Stats · ${profile.name}`,
    'What joey-haas.dev sees, counted by the site itself: views, visitors, pages and referrers, with no cookies or third-party scripts, and what changed recently.',
  ),
  row(
    denver.page.path,
    'Denver',
    `${denver.page.title} · ${profile.name}`,
    denver.page.description,
  ),
  row(daily.path, daily.title, daily.headTitle, daily.description),
]

/** The blog index's row, listed only when there are published posts. */
export const BLOG_PAGE = row(
  '/blog',
  'Blog',
  `Blog · ${profile.name}`,
  `Posts by ${profile.name}.`,
)

/** /til, listed (and prerendered) only while a note is published. */
export const TIL_PAGE = row(
  '/til',
  'TIL',
  `TIL · ${profile.name}`,
  `Short notes by ${profile.name}: things learned while building this site.`,
)

/** /travel, listed (and prerendered) only while a trip is published (D10). */
export const TRAVEL_PAGE = row(
  '/travel',
  'Travel',
  `Travel · ${profile.name}`,
  `Trips by ${profile.name}, a day at a time: where we went, what happened and a few photos.`,
)

/** The static pages to list, given whether any post is published. */
export function staticPages(hasPosts) {
  return hasPosts ? [...STATIC_PAGES, BLOG_PAGE] : STATIC_PAGES
}
