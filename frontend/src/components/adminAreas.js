/**
 * The admin, organised as areas. Each area has a home page (where its phone
 * tab lands), a one-line description shown at the top of its page list, and
 * its pages in list order. Every page keeps the URL it had before areas.
 *
 * A page is `{ to, label, end?, count?, group?, alias?, badge? }`:
 * - `end`: matches only its exact path (an index route).
 * - `count`: shows the owned count beside it.
 * - `group`: a kicker heading the run of pages that share it (Shelf only).
 * - `alias`: listed here too, but the page belongs to another area; it is
 *   never what decides the current area.
 * - `badge`: the key of a pending count the layout loads (`intake.shelf`,
 *   `intake.closet`: entries left to check), shown beside the page and
 *   read out as part of its name.
 *
 * `subnav` is the phone's segmented control for the area. An entry is a page
 * (`{ to, label }`) or a sheet of pages (`{ label, sheet: [to, ...] }`).
 * Without one, the area's own pages are the segments.
 *
 * Keep in step with App.jsx's admin routes and `ADMIN_ROUTES` in
 * `scripts/prerender-lib.mjs`; `adminAreas.test.js` pins the first.
 */
export const ADMIN_AREAS = [
  {
    key: 'home',
    label: 'Home',
    icon: '⌂',
    home: '/admin',
    description: 'everything, one card each',
    pages: [
      { to: '/admin', label: 'Home', end: true },
      { to: '/admin/jobs', label: 'Jobs' },
    ],
  },
  {
    key: 'shelf',
    label: 'Shelf',
    icon: '▦',
    home: '/admin/collection',
    description: 'what I own, play and read',
    pages: [
      {
        to: '/admin/collection',
        label: 'Collection',
        count: true,
        group: 'Collection',
      },
      {
        to: '/admin/collection/add',
        label: 'Add',
        group: 'Collection',
        badge: 'intake.shelf',
      },
      { to: '/admin/play-next', label: 'Play Next', group: 'Recommend' },
      { to: '/admin/discover', label: 'Discover', group: 'Recommend' },
      { to: '/admin/radar', label: 'Radar', group: 'Recommend' },
      { to: '/admin/pull-list', label: 'Pull list', group: 'Recommend' },
      { to: '/admin/catalogue', label: 'Sources', group: 'Data' },
      { to: '/admin/store-list', label: 'Store list', group: 'Data' },
    ],
    subnav: [
      { to: '/admin/collection', label: 'Collection' },
      { to: '/admin/collection/add', label: 'Add' },
      {
        label: 'Picks',
        sheet: [
          '/admin/play-next',
          '/admin/discover',
          '/admin/radar',
          '/admin/pull-list',
        ],
      },
      { to: '/admin/catalogue', label: 'Sources' },
      { label: 'More', sheet: ['/admin/store-list'] },
    ],
  },
  {
    key: 'closet',
    label: 'Closet',
    icon: '◫',
    home: '/admin/closet/today',
    description: 'what to wear, what to keep',
    pages: [
      { to: '/admin/closet/today', label: 'Today' },
      { to: '/admin/closet', label: 'Closet' },
      { to: '/admin/closet/add', label: 'Add', badge: 'intake.closet' },
      { to: '/admin/closet/review', label: 'Review' },
      { to: '/admin/closet/profile', label: 'Profile' },
    ],
  },
  {
    key: 'denver',
    label: 'Denver',
    icon: '◎',
    home: '/admin/weekend',
    description: 'spots and weekends',
    pages: [
      { to: '/admin/weekend', label: 'Weekend' },
      { to: '/admin/spots', label: 'Spots' },
    ],
  },
  {
    key: 'site',
    label: 'Site',
    icon: '◇',
    home: '/admin/analytics',
    description: 'the website itself',
    pages: [
      { to: '/admin/analytics', label: 'Analytics' },
      { to: '/admin/jobs', label: 'Jobs', alias: true },
    ],
  },
]

/** Whether `pathname` is the page or, unless `end`, nested under it. */
export function onPage(page, pathname) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return path === page.to || (!page.end && path.startsWith(`${page.to}/`))
}

/**
 * The one page of `pages` that `pathname` is on: the longest match, so
 * /admin/closet/profile is Profile, not Closet as well, while
 * /admin/closet/12 (a garment, under no page of its own) stays Closet.
 */
export function currentPage(pages, pathname) {
  let best = null
  for (const page of pages) {
    if (page?.to && onPage(page, pathname)) {
      if (!best || page.to.length > best.to.length) best = page
    }
  }
  return best
}

/**
 * The page `pathname` is on within `area`, its own pages first, the
 * longest match among them (/admin/collection/add is Add, not Collection).
 */
export function pageFor(area, pathname) {
  const owned = area.pages.filter((page) => !page.alias)
  return currentPage(owned, pathname) ?? currentPage(area.pages, pathname)
}

/**
 * The area a pathname belongs to: the area owning the page it is on (an
 * alias never decides), or Home for anything else under /admin, such as a
 * mistyped URL, so the shell always has an area to show.
 */
export function areaFor(pathname) {
  return (
    ADMIN_AREAS.find((area) =>
      area.pages.some((page) => !page.alias && onPage(page, pathname)),
    ) ?? ADMIN_AREAS[0]
  )
}

/** A page by its path, from any area's own pages. */
export function pageAt(to) {
  for (const area of ADMIN_AREAS) {
    const page = area.pages.find((p) => p.to === to && !p.alias)
    if (page) return page
  }
  return null
}

/**
 * The phone segments for an area, sheets resolved to their pages and a
 * page segment carrying its page's fields (its badge).
 */
export function segmentsFor(area) {
  if (!area.subnav) return area.pages.map((page) => ({ ...page }))
  return area.subnav.map((entry) =>
    entry.sheet
      ? { label: entry.label, sheet: entry.sheet.map((to) => pageAt(to)) }
      : { ...pageAt(entry.to), ...entry },
  )
}
