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
}
