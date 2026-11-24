// Group G3's scenarios for style-dump.mjs (#536): the last of index.css, in
// four parts, one per commit: `g3a` (the comics family: the run box and lanes,
// the cover wall's tiles, stacks and pills, the issue page's neighbour strip),
// `g3b` (the shared primitives: buttons, kicker, muted, sheet, hero, chip
// rows, empty states), `g3c` (the admin and stats pages: playthroughs, the
// play journal, the store list, the item detail, Stats and its changelog) and
// `g3d` (`.admin-error` and what is left). A scenario whose element the page
// does not draw logs `absent: <selector>` and is dumped as it stands, the same
// on both sides. Run the pair with `ONLY=' g3a '` and so on.
import { readFileSync } from 'node:fs'
import { COMIC_ID, GAME_ID, mockAdminData } from '../../admin-data-mocks.js'

const api = (name) =>
  JSON.parse(
    readFileSync(new URL(`../../fixtures/api/${name}.json`, import.meta.url)),
  )

const RUN = '22222222-bbbb-4bbb-8bbb-000000000002'
const BOTH = '55555555-bbbb-4bbb-8bbb-000000000005'
const BOOK_LINE = '33333333-bbbb-4bbb-8bbb-000000000003'

const json = (route, body) =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })

/** A long run: owned 1-6, a book (7-12), owned 13-30 (a bundle), 31-60
 *  missing (a stack), one skipped, read to 3, the next issue not out. */
function longRun(base) {
  const comic = {
    ...base.comic,
    kind: 'run',
    owned_text: '1-6, 13-30',
    released: 60,
    ongoing: true,
    run_state: 'gaps',
    missing: 30,
    read_to: 3,
    read: 3,
    issue_count: 60,
    next_issue: { number: '61', store_date: '2026-12-02' },
    editions: [
      {
        slug: 'vol-1',
        kind: 'trade',
        label: 'Volume One',
        from_issue: 7,
        to_issue: 12,
        cover_url: null,
      },
    ],
    volumes: [],
    volumes_owned: 0,
  }
  const body = { ...base, id: RUN, title: 'Paper Moons', comic }
  const wall = {
    series_title: 'Paper Moons',
    publisher: 'Fixture Press',
    issues: Array.from({ length: 60 }, (_, i) => ({
      number: i + 1,
      owned: i < 6 || (i >= 12 && i < 30),
      read: i < 3,
      name: null,
      store_date: '2020-01-01',
      cover_url: null,
    })),
    editions: comic.editions,
  }
  return { body, wall }
}

/**
 * @param {{record: Function}} tools style-dump's own helper.
 * @param {string} theme
 * @param {string} vp
 */
export async function g3({ record }, theme, vp) {
  const at = (tag, name) => `screen ${theme} ${vp} g3${tag} ${name}`
  const spec = (path, kind, extra = {}) => ({
    path,
    theme,
    vp,
    kind,
    ...extra,
  })
  const on =
    (selector, action, n = 0, then) =>
    async (page) => {
      await page.waitForLoadState('networkidle').catch(() => {})
      const target = page.locator(selector).nth(n)
      if (!(await target.count())) {
        console.error(`absent: ${selector}`)
        return
      }
      if (action === 'hover') await target.hover()
      if (action === 'focus') {
        await page.keyboard.press('Tab')
        await target.focus()
      }
      if (action === 'press') await target.click()
      await page.waitForTimeout(300)
      if (then) await then(page)
    }
  const seen = (...selectors) =>
    async function check(page) {
      for (const selector of selectors)
        if (!(await page.locator(selector).count()))
          console.error(`absent: ${selector}`)
    }

  // ---------- g3a: the comics family ----------
  const { body: runBody, wall } = longRun(api('public-comic-run'))
  const series = (id, body, wallBody, extra = {}) =>
    spec(`/shelf/${id}`, undefined, {
      ...extra,
      mock: async (page) => {
        if (extra.mock) await extra.mock(page)
        await page.route(`**/api/public/items/${id}`, (r) => json(r, body))
        if (wallBody)
          await page.route(`**/api/public/items/${id}/issues`, (r) =>
            json(r, wallBody),
          )
      },
    })
  const both = api('public-comic-both')
  const bothWall = api('public-comic-wall-both')
  const withWall = (extra) => series(RUN, runBody, wall, extra)
  const owner = (page) =>
    page.route('**/api/auth/me*', (r) =>
      r.fulfill({ json: { email: 'a@example.com' } }),
    )
  const check = (inner) => async (page) => {
    await seen(
      '.run-box',
      '.lanes',
      '.run-key',
      '.cover-tile',
      '.cover-stack',
    )(page)
    if (inner) await inner(page)
  }

  // The run as a box: cells, a book, a bundle, the next issue, the lanes and
  // the key, with and without its wall.
  await record(
    at('a', 'box'),
    series(RUN, runBody, null),
    seen('.run-box', '.run-book', '.run-bundle', '.lanes', '.run-key'),
  )
  await record(
    at('a', 'box bundle open'),
    series(RUN, runBody, null),
    on('.run-bundle', 'press', 0),
  )
  await record(
    at('a', 'box bundle hover'),
    series(RUN, runBody, null),
    on('.run-bundle', 'hover', 0),
  )
  await record(
    at('a', 'box bundle focus'),
    series(RUN, runBody, null),
    on('.run-bundle', 'focus', 0),
  )
  await record(
    at('a', 'box fold focus'),
    series(RUN, runBody, null),
    on('.run-bundle', 'press', 0),
  )
  await record(
    at('a', 'box touch'),
    series(RUN, runBody, null, { touch: true }),
  )
  await record(
    at('a', 'box print'),
    series(RUN, runBody, null, { media: 'print' }),
  )
  // The wall: covers, a book, a stack, the next issue, the key.
  await record(at('a', 'wall'), withWall(), check())
  await record(
    at('a', 'wall tile hover'),
    withWall(),
    on('a.cover-tile', 'hover', 0),
  )
  await record(
    at('a', 'wall tile focus'),
    withWall(),
    on('a.cover-tile', 'focus', 0),
  )
  await record(
    at('a', 'wall tile hover touch'),
    withWall({ touch: true }),
    on('a.cover-tile', 'hover', 0),
  )
  await record(
    at('a', 'wall book hover'),
    withWall(),
    on('a.book-tile', 'hover', 0),
  )
  await record(
    at('a', 'wall book focus'),
    withWall(),
    on('a.book-tile', 'focus', 0),
  )
  await record(
    at('a', 'wall stack hover'),
    withWall(),
    on('.cover-stack', 'hover', 0),
  )
  await record(
    at('a', 'wall stack focus'),
    withWall(),
    on('.cover-stack', 'focus', 0),
  )
  await record(
    at('a', 'wall stack open'),
    withWall(),
    on('.cover-stack', 'press', 0),
  )
  await record(
    at('a', 'wall stack open fold focus'),
    withWall(),
    on('.cover-stack', 'press', 0, on('.cover-stack[data-fold]', 'focus', 0)),
  )
  await record(at('a', 'wall missing'), withWall(), on('.chip', 'press', 1))
  await record(at('a', 'wall print'), withWall({ media: 'print' }))
  // Signed in: each cover a button, a link beside it, the status line.
  const mine = (extra = {}) =>
    withWall({ kind: 'signed-in', ...extra, mock: owner })
  await record(at('a', 'owner wall'), mine(), seen('.cover-tile-btn'))
  await record(
    at('a', 'owner wall hover'),
    mine(),
    on('.cover-tile-btn', 'hover', 0),
  )
  await record(
    at('a', 'owner wall hover missing'),
    mine(),
    on('.cover-tile-btn', 'hover', 20),
  )
  await record(
    at('a', 'owner wall focus'),
    mine(),
    on('.cover-tile-btn', 'focus', 0),
  )
  await record(
    at('a', 'owner wall link hover'),
    mine(),
    on('a.cover-tile-cap', 'hover', 0),
  )
  await record(
    at('a', 'owner wall link focus'),
    mine(),
    on('a.cover-tile-cap', 'focus', 0),
  )
  await record(
    at('a', 'owner wall press'),
    mine(),
    on('.cover-tile-btn', 'press', 0),
  )
  await record(
    at('a', 'owner wall touch'),
    mine({ touch: true }),
    on('.cover-tile-btn', 'hover', 0),
  )
  // A title with books and issues: the book wall and the single-book card.
  const bothSeries = (extra) => series(BOTH, both, bothWall, extra)
  await record(at('a', 'both'), bothSeries())
  await record(
    at('a', 'both book hover'),
    bothSeries(),
    on('a.book-tile', 'hover', 0),
  )
  await record(
    at('a', 'both book focus'),
    bothSeries(),
    on('a.book-tile', 'focus', 0),
  )
  const line = spec(`/shelf/${BOOK_LINE}`, undefined, {
    mock: async (page) => {
      await page.route(`**/api/public/items/${BOOK_LINE}`, (r) =>
        json(r, api('public-comic-book_line')),
      )
    },
  })
  await record(at('a', 'book line'), line)
  await record(
    at('a', 'book line tile hover'),
    line,
    on('a.book-tile', 'hover', 0),
  )
  await record(
    at('a', 'book line tile focus'),
    line,
    on('a.book-tile', 'focus', 0),
  )
  // An issue page: the pill, the neighbour strip with every state.
  const NEIGHBOURS = [
    { number: 1, cover_url: null, state: 'read' },
    { number: 2, cover_url: null, state: 'owned' },
    { number: 3, cover_url: null, state: 'missing' },
    { number: 4, cover_url: null, state: 'skipped' },
    { number: 5, cover_url: null, state: 'owned' },
    { number: 6, cover_url: null, state: 'not-out' },
  ]
  const issue = (n = 3, extra = {}) =>
    spec(`/shelf/${RUN}/${n}`, undefined, {
      ...extra,
      mock: async (page) => {
        await page.route(`**/api/public/items/${RUN}/issues/${n}`, (r) =>
          json(r, { ...api('issue'), number: n, neighbours: NEIGHBOURS }),
        )
      },
    })
  await record(at('a', 'issue'), issue(), seen('.neighbour-strip'))
  await record(
    at('a', 'issue tile hover'),
    issue(),
    on('.neighbour-strip a.cover-tile', 'hover', 0),
  )
  await record(
    at('a', 'issue tile focus'),
    issue(),
    on('.neighbour-strip a.cover-tile', 'focus', 1),
  )
  await record(
    at('a', 'issue missing tile hover'),
    issue(),
    on('.neighbour-strip a.cover-tile', 'hover', 2),
  )
  await record(at('a', 'issue touch'), issue(3, { touch: true }))
  await record(at('a', 'issue print'), issue(3, { media: 'print' }))

  await g3b({ record, on, spec, seen, at, theme, vp })
  await g3c({ record, on, spec, seen, at, theme, vp })
}

/** Part b: the shared primitives (buttons, hero, tabs, chip rows, sheets). */
async function g3b({ record, on, spec, seen, at, theme, vp }) {
  const home = spec('/', 'home')
  await record(
    at('b', 'home'),
    home,
    seen('.hero', '.hero-actions', '.cover-strip'),
  )
  await record(
    at('b', 'home action hover'),
    home,
    on('.hero-actions a', 'hover', 1),
  )
  await record(
    at('b', 'home action focus'),
    home,
    on('.hero-actions a', 'focus', 0),
  )
  await record(
    at('b', 'home section link focus'),
    home,
    on('.section-head a', 'focus', 0),
  )
  await record(
    at('b', 'projects'),
    spec('/projects'),
    seen('.cover-strip', '.project-links'),
  )
  await record(
    at('b', 'projects link hover'),
    spec('/projects'),
    on('.project-links a', 'hover', 0),
  )
  // The shelf's header: name, lede and tabs, each hovered and tabbed to.
  const shelf = spec('/shelf/games')
  await record(at('b', 'spine'), shelf, seen('.spine-header', '.spine-tabs a'))
  await record(
    at('b', 'spine tab hover'),
    shelf,
    on('.spine-tabs a:not([aria-current])', 'hover', 0),
  )
  await record(
    at('b', 'spine tab current hover'),
    shelf,
    on('.spine-tabs a[aria-current]', 'hover', 0),
  )
  await record(
    at('b', 'spine tab focus'),
    shelf,
    on('.spine-tabs a', 'focus', 1),
  )
  await record(
    at('b', 'spine name focus'),
    shelf,
    on('.spine-name a', 'focus', 0),
  )
  await record(
    at('b', 'spine name hover'),
    shelf,
    on('.spine-name a', 'hover', 0),
  )
  await record(at('b', 'spine touch'), { ...shelf, touch: true })
  await record(at('b', 'spine year'), spec('/shelf/year'))
  await record(at('b', 'spine how'), spec('/shelf/how'))
  if (vp === 'desktop')
    for (const edge of [
      'w320',
      'w544',
      'w545',
      'w700',
      'w701',
      'w980',
      'w981',
    ]) {
      const at2 = (name) => `screen ${theme} g3b ${name} ${edge}`
      await record(at2('home'), { path: '/', theme, vp: edge, kind: 'home' })
      await record(at2('shelf'), { path: '/shelf/games', theme, vp: edge })
      await record(at2('comics'), { path: '/shelf/comics', theme, vp: edge })
      await record(at2('projects'), { path: '/projects', theme, vp: edge })
      await record(at2('next'), {
        path: '/shelf/next',
        theme,
        vp: edge,
        kind: 'next',
      })
      await record(at2('daily'), { path: '/shelf/daily', theme, vp: edge })
    }
}

/** Part c: the admin and stats pages (item edit, playthroughs, Stats). */
async function g3c({ record, on, spec, seen, at, theme, vp }) {
  const admin = (path, extra = {}) =>
    spec(path, undefined, { ...extra, mock: mockAdminData })
  const game = admin(`/admin/collection/${GAME_ID}`)
  await record(
    at('c', 'game'),
    game,
    seen(
      '.item-detail',
      '.item-relink',
      '.play-journal-list',
      '.item-playthroughs',
      '.playthroughs-table',
      '.registry-line',
    ),
  )
  await record(
    at('c', 'game touch'),
    admin(`/admin/collection/${GAME_ID}`, { touch: true }),
  )
  await record(
    at('c', 'game add past'),
    game,
    on('.playthroughs-add button', 'press', 0),
  )
  await record(
    at('c', 'game relink focus'),
    game,
    on('.item-relink input', 'focus', 0),
  )
  await record(
    at('c', 'game status focus'),
    game,
    on('.item-status-control select', 'focus', 0),
  )
  await record(
    at('c', 'game journal delete hover'),
    game,
    on('.play-journal-list button', 'hover', 0),
  )
  await record(
    at('c', 'game run edit'),
    game,
    on('.playthroughs-table input', 'press', 0, async (page) => {
      await page.locator('.playthroughs-table input').first().fill('2024-03-02')
      await page.waitForTimeout(200)
    }),
  )
  await record(
    at('c', 'game print'),
    admin(`/admin/collection/${GAME_ID}`, { media: 'print' }),
  )
  await record(
    at('c', 'comic'),
    admin(`/admin/shelf/comics/${COMIC_ID}`),
    seen('.item-relink', '.item-attribution'),
  )
  await record(
    at('c', 'collection'),
    admin('/admin/collection'),
    seen('.item-cover-cell'),
  )
  await record(
    at('c', 'catalogue'),
    admin('/admin/catalogue'),
    seen('.needs-match-row'),
  )
  await record(
    at('c', 'store list'),
    admin('/admin/store-list'),
    seen('.store-list-section', '.store-lines'),
  )
  await record(
    at('c', 'store list link hover'),
    admin('/admin/store-list'),
    on('.store-lines a', 'hover', 0),
  )
  // The public item page, signed in: the runs table, read-only.
  const gameBody = {
    ...api('public-comic-run'),
    id: GAME_ID,
    type: 'game',
    title: 'Pinned Game',
    comic: null,
    platforms: ['Nintendo Switch 2'],
    description: 'An invented game. '.repeat(40),
  }
  const mine = spec(`/shelf/${GAME_ID}`, 'signed-in', {
    mock: async (page) => {
      await mockAdminData(page)
      await page.route(`**/api/public/items/${GAME_ID}`, (r) =>
        json(r, gameBody),
      )
    },
  })
  await record(
    at('c', 'public item runs'),
    mine,
    seen(
      '.item-playthroughs',
      '.playthroughs-note',
      '.item-tile-figure',
      '.item-description',
    ),
  )
  await record(at('c', 'public item runs touch'), { ...mine, touch: true })
  await record(
    at('c', 'public item expand'),
    mine,
    on('.item-description-wrap button', 'press', 0),
  )
  await record(
    at('c', 'stats'),
    spec('/stats', undefined, { serve: ['site-stats'] }),
    seen('.site-stats', '.site-stats-lists', '.changelog'),
  )
  await record(
    at('c', 'stats changelog link hover'),
    spec('/stats', undefined, { serve: ['site-stats'] }),
    on('.changelog a', 'hover', 0),
  )
  await record(
    at('c', 'stats feed focus'),
    spec('/stats', undefined, { serve: ['site-stats'] }),
    on('.changes-feed a', 'focus', 0),
  )
  if (vp === 'desktop')
    for (const edge of [
      'w320',
      'w544',
      'w545',
      'w640',
      'w641',
      'w700',
      'w701',
    ]) {
      const at2 = (name) => `screen ${theme} g3c ${name} ${edge}`
      await record(at2('stats'), {
        path: '/stats',
        theme,
        vp: edge,
        serve: ['site-stats'],
      })
      await record(at2('game'), {
        path: `/admin/collection/${GAME_ID}`,
        theme,
        vp: edge,
        mock: mockAdminData,
      })
      await record(at2('store list'), {
        path: '/admin/store-list',
        theme,
        vp: edge,
        mock: mockAdminData,
      })
      await record(at2('play next'), {
        path: '/admin/play-next',
        theme,
        vp: edge,
        kind: 'play-next',
      })
    }
}
