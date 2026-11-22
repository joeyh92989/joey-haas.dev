// Group G1's scenarios for style-dump.mjs (#536): the public pages that still
// used index.css. Three parts, one per commit: `g1a` (Play next, Pick for me,
// What's next, Tonight, Radar, Discover, Rate a few, the store list and Pull
// list), `g1b` (the Daily game and the rest of the shelf) and `g1c` (the static
// pages). A scenario whose element the page does not draw logs
// `absent: <selector>` and is dumped as it stands, the same on both sides.
import { readFileSync } from 'node:fs'
import { GAMES } from '../../admin-shelf.fixtures.js'
import { PICK_TABLE } from '../../tools-data.fixtures.js'

const LONG =
  'A Remarkably Long Game Title That Keeps Going Past Any Sensible Card Width, Part Two'
const UNBROKEN = 'Supercalifragilisticexpialidocious'.repeat(2)

const pick = (id, title, slot, extra = {}) => ({
  item_id: id,
  type: 'game',
  title,
  cover_url: null,
  platform: 'Nintendo Switch',
  slot_label: slot,
  time_to_beat_hours: 8,
  size: { unit: 'hours', value: 8 },
  reasons: [`${title} matches games you finished.`, 'A second, longer reason.'],
  ...extra,
})
const card = (id, title, extra = {}) => ({
  item_id: id,
  type: 'game',
  title,
  cover_url: null,
  platform: 'Nintendo Switch 2',
  time_to_beat_hours: 30,
  playthrough: 1,
  playing_since: '2026-10-24',
  last_played_on: '2026-12-14',
  journal_hours: 31,
  sessions: 9,
  stale: false,
  ...extra,
})
const row = (title, extra = {}) => ({
  type: 'game',
  title,
  platform: 'Nintendo Switch 2',
  physical_format: 'game_card',
  release_date: '2026-12-01',
  release_precision: 'day',
  cover_url: null,
  igdb_url: 'https://www.igdb.com/games/x',
  reasons: ['Matches the genres you finish most', 'Second reason here'],
  top_pick: false,
  new: false,
  item_id: null,
  lane: 'physical',
  ...extra,
})
const rows = (n, prefix, extra) =>
  Array.from({ length: n }, (_, index) =>
    row(index === 0 ? LONG : `${prefix} ${index + 1}`, {
      top_pick: index < 2,
      new: index === 1,
      ...extra,
    }),
  )

/** What's next's body with every part the page draws. */
function nextBody({ continuing = [], upNext = null } = {}) {
  return {
    generated_at: '2026-12-14T12:00:00Z',
    tonight: {
      continuing,
      up_next: upNext,
      picks: [
        pick('a', 'Alpha Quest', 'Best fit'),
        pick('b', LONG, 'Short and sweet'),
        pick('c', 'Gamma Station', 'Overdue classic'),
        pick('d', UNBROKEN, 'Change of pace'),
      ],
      last_finish: {
        title: LONG,
        cover_url: null,
        finished_at: '2026-12-13T20:00:00Z',
        time_to_beat_hours: 12,
        rating: 8,
      },
      read_next: [
        {
          ...pick('r1', 'Saga', 'Read next', { type: 'comic' }),
          platform: null,
          progress: { read: 3, of: 12 },
        },
      ],
      watch_next: [
        {
          ...pick('m1', 'A Long Movie Title', 'Watch next', { type: 'movie' }),
          platform: null,
        },
      ],
    },
    comics_this_week: [
      {
        item_id: 'cx1',
        title: LONG,
        number: '173',
        publisher: 'Image',
        store_date: '2026-12-16',
        cover_url: null,
        owned_text: '1–172',
        released: 173,
      },
      {
        item_id: 'cx2',
        title: 'Saga',
        number: '74',
        publisher: 'Image',
        store_date: '2026-12-16',
        cover_url: null,
        owned_text: null,
        released: 74,
      },
    ],
    wanted: rows(8, 'Wanted', { item_id: 'w1x' }),
    buy_now: rows(3, 'Buy now'),
    preorders: rows(2, 'Preorder'),
    later: rows(1, 'Later'),
    not_on_cartridge: [
      row('Digital One', { lane: 'digital', physical_format: null }),
      row('Digital Two', { lane: 'digital', physical_format: null }),
    ],
  }
}

const json = (route, body, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })

/** Replaces the page's Next answers with `body` and reloads. */
async function loadNext(page, body, { signedIn = false } = {}) {
  for (const [name, answer] of [
    ['next', body],
    ['pick-for-me', PICK_TABLE],
  ]) {
    await page.route(`**/snapshot/${name}.json`, (r) => json(r, answer))
    await page.route(`**/api/public/${name}`, (r) => json(r, answer))
  }
  if (signedIn) {
    await page.route('**/api/auth/me*', (r) =>
      json(r, { email: 'a@example.com' }),
    )
    await page.route('**/api/picker/skipped-today', (r) =>
      json(r, { item_ids: [] }),
    )
    await page.route('**/api/picker/**', (r) => json(r, {}))
    await page.route('**/api/items/**', (r) => json(r, {}))
  }
  await page.reload()
  await page.locator('h1').first().waitFor({ timeout: 15000 })
  await settle(page)
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(500)
}

/**
 * @param {{record: Function, click: Function}} tools style-dump's own helpers.
 * @param {string} theme
 * @param {string} vp
 */
export async function g1({ record }, theme, vp) {
  const at = (tag, name) => `screen ${theme} ${vp} g1${tag} ${name}`
  const spec = (path, kind, touch) => ({ path, theme, vp, kind, touch })
  // Act on the nth match: hover, tab to, or press it; logs when absent.
  const on =
    (selector, action, n = 0, then) =>
    async (page) => {
      await settle(page)
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
  const withNext = (body, options, inner) => async (page) => {
    await loadNext(page, body, options)
    if (inner) await inner(page)
  }

  // ---------- g1a: What's next and Tonight ----------
  const lead = nextBody({ upNext: pick('u', 'Pinned Game', 'Up next') })
  const plain = nextBody()
  const playing = nextBody({
    continuing: [
      card('p1', 'Active Game'),
      card('p2', LONG, { stale: true, last_played_on: '2026-11-20' }),
    ],
    upNext: pick('u', 'Pinned Game', 'Up next'),
  })
  for (const touch of [false, true]) {
    const mode = touch ? 'touch ' : ''
    const next = spec('/shelf/next', 'signed-in', touch)
    if (!touch) {
      await record(at('a', 'next pinned lead'), next, withNext(lead))
      await record(at('a', 'next plain lead'), next, withNext(plain))
      await record(at('a', 'next continue'), next, withNext(playing))
      await record(
        at('a', 'next pinned lead owner'),
        next,
        withNext(lead, { signedIn: true }),
      )
      await record(
        at('a', 'next plain lead owner'),
        next,
        withNext(plain, { signedIn: true }),
      )
      await record(
        at('a', 'next continue owner'),
        next,
        withNext(playing, { signedIn: true }),
      )
      await record(
        at('a', 'next lead skipped toast'),
        next,
        withNext(
          plain,
          { signedIn: true },
          on('.tonight-lead .btn:not(.primary)', 'press'),
        ),
      )
      await record(
        at('a', 'next alt skipped toast'),
        next,
        withNext(
          plain,
          { signedIn: true },
          on('.tonight-alt .btn.ghost', 'press'),
        ),
      )
      await record(
        at('a', 'next list skipped toast'),
        next,
        withNext(
          playing,
          { signedIn: true },
          on('.picklist .btn, .picklist button', 'press', 1),
        ),
      )
      await record(
        at('a', 'next continue skipped toast'),
        next,
        withNext(
          playing,
          { signedIn: true },
          on('.tonight-continuing .btn.ghost', 'press'),
        ),
      )
      await record(
        at('a', 'next rows open'),
        next,
        withNext(plain, {}, async (page) => {
          for (const toggle of await page.locator('.capped-toggle').all())
            await toggle.click()
          await page.locator('.next-skip summary').click()
          await page.waitForTimeout(300)
        }),
      )
      await record(
        at('a', 'next pick for me chosen'),
        next,
        withNext(plain, {}, async (page) => {
          await page.locator('.pick-radio').first().click()
          await page
            .locator('.pick-choices .chip[aria-pressed]')
            .first()
            .click()
          await page.waitForTimeout(300)
        }),
      )
      await record(
        at('a', 'next pick for me radio focus'),
        next,
        withNext(plain, {}, async (page) => {
          await page.locator('.pick-radio input').first().focus()
          await page.keyboard.press('Space')
          await page.waitForTimeout(300)
        }),
      )
      await record(
        at('a', 'next title focus'),
        next,
        withNext(plain, {}, on('.tonight-title', 'focus', 1)),
      )
      await record(
        at('a', 'next row link focus'),
        next,
        withNext(plain, {}, on('.next-row-link', 'focus', 0)),
      )
    }
    await record(
      at('a', `${mode}next title hover`),
      next,
      withNext(plain, {}, on('.tonight-title', 'hover', 1)),
    )
    await record(
      at('a', `${mode}next owner button hover`),
      next,
      withNext(plain, { signedIn: true }, on('.tonight-lead .btn', 'hover', 1)),
    )
    await record(
      at('a', `${mode}next row title hover`),
      next,
      withNext(plain, {}, on('.next-row-link', 'hover', 1)),
    )
    await record(
      at('a', `${mode}next toggle hover`),
      next,
      withNext(plain, {}, on('.capped-toggle', 'hover', 0)),
    )
    await record(
      at('a', `${mode}next radio hover`),
      next,
      withNext(plain, {}, on('.pick-radio', 'hover', 1)),
    )
  }
  // Pick for me empty-ish: no lead to leave out, so every pick shows.
  await record(
    at('a', 'next no tonight'),
    spec('/shelf/next', 'signed-in'),
    withNext({
      ...plain,
      tonight: { ...plain.tonight, picks: [], last_finish: null },
    }),
  )

  // ---------- g1a: Play next ----------
  const playNext = async (page, { profile = 2, pinned = true } = {}) => {
    const games = pinned
      ? GAMES.map((game, index) =>
          index === 0 ? { ...game, pinned_at: '2026-12-10T00:00:00Z' } : game,
        )
      : GAMES
    await page.route('**/api/items', (r) =>
      r.request().method() === 'GET' ? json(r, games) : r.fallback(),
    )
    await page.route('**/api/picker/**', (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/continuing'))
        return json(route, {
          cards: [
            card('p1', 'Active Game'),
            card('p2', LONG, { stale: true, last_played_on: '2026-11-20' }),
          ],
        })
      if (path.endsWith('/skipped-today')) return json(route, { item_ids: [] })
      if (path.endsWith('/next'))
        return json(route, {
          picks: [
            ['a', 'Dead Cells', 'best_fit', 'Best fit'],
            ['b', LONG, 'short_and_sweet', 'Short and sweet'],
            ['c', UNBROKEN, 'overdue_classic', 'Overdue classic'],
          ].map(([id, title, slot, slotLabel]) => ({
            slot,
            slot_label: slotLabel,
            score: 80,
            reasons: [
              `Reason for ${title}`,
              'Another reason that is long enough to wrap onto a second line',
            ],
            item: {
              id,
              title,
              year: 2020,
              cover_url: null,
              type: 'game',
              platform: 'Nintendo Switch',
              genres: ['Indie', 'Platform', 'Action', 'Extra'],
              time_to_beat_hours: 8,
            },
          })),
          candidate_count: 12,
          profile_size: profile,
        })
      return json(route, {})
    })
    await page.reload()
    await page.locator('h1').first().waitFor({ timeout: 15000 })
    await settle(page)
  }
  for (const touch of [false, true]) {
    const mode = touch ? 'touch ' : ''
    const pn = spec('/admin/play-next', 'play-next', touch)
    const loaded = (inner) => async (page) => {
      await playNext(page)
      if (inner) await inner(page)
    }
    await record(at('a', `${mode}play next full`), pn, loaded())
    await record(
      at('a', `${mode}play next card button hover`),
      pn,
      loaded(on('.pick-actions button', 'hover', 0)),
    )
    await record(
      at('a', `${mode}play next unpin hover`),
      pn,
      loaded(on('.up-next button', 'hover', 0)),
    )
    await record(
      at('a', `${mode}play next reroll hover`),
      pn,
      loaded(on('.play-next-reroll button', 'hover', 0)),
    )
    if (!touch) {
      await record(
        at('a', 'play next card button focus'),
        pn,
        loaded(on('.pick-actions button', 'focus', 1)),
      )
      await record(at('a', 'play next no nudge'), pn, async (page) =>
        playNext(page, { profile: 20, pinned: false }),
      )
    }
  }

  // ---------- g1a: Radar, Discover, Rate a few, store list, Pull list ----------
  const add = (path) => spec(path, 'add')
  await record(
    at('a', 'radar digital open'),
    add('/admin/radar'),
    on('.radar-digital summary', 'press'),
  )
  await record(
    at('a', 'radar digital summary hover'),
    add('/admin/radar'),
    on('.radar-digital summary', 'hover'),
  )
  await record(
    at('a', 'radar watch note'),
    add('/admin/radar'),
    on('.radar-watch-note a', 'focus'),
  )
  await record(
    at('a', 'discover rate row hover'),
    add('/admin/discover'),
    on('.rate-a-few-table tbody tr', 'hover', 1),
  )
  await record(
    at('a', 'discover rate row focus'),
    add('/admin/discover'),
    on('.rate-a-few-table [role="radio"]', 'focus', 0),
  )
  await record(
    at('a', 'discover rate saved'),
    add('/admin/discover'),
    async (page) => {
      await page.route('**/api/items/**', (r) =>
        r.request().method() === 'PATCH' ? json(r, {}) : r.fallback(),
      )
      await on('.rate-a-few-table [role="radio"]', 'press', 4)(page)
    },
  )
  await record(
    at('a', 'discover choice focus'),
    add('/admin/discover'),
    on('.discover-choice input', 'focus', 0),
  )
  await record(
    at('a', 'pull list done'),
    add('/admin/pull-list'),
    async (page) => {
      await page.route('**/api/comics/**', (r) =>
        r.request().method() === 'POST' ? json(r, {}) : r.fallback(),
      )
      await on('.next-row-actions button', 'press', 0)(page)
    },
  )
  await record(
    at('a', 'pull list row hover'),
    add('/admin/pull-list'),
    on('.next-row-link', 'hover', 1),
  )
  await record(
    at('a', 'store list'),
    spec('/admin/store-list', 'add'),
    async (page) => {
      const entries = (n, prefix, extra) =>
        rows(n, prefix, extra).map((entry, index) => ({
          ...entry,
          id: `${prefix}-${index}`,
          format_note: index === 0 ? 'A note about the format' : null,
          store_lines: [],
        }))
      const body = {
        sections: {
          buy_now: [
            ...entries(2, 'Switch', { platform: 'Nintendo Switch' }),
            ...entries(2, 'Switch 2', { platform: 'Nintendo Switch 2' }),
          ],
          preorders: entries(2, 'Pre'),
          later: entries(1, 'Later'),
          not_on_cartridge: entries(2, 'Digital', { physical_format: null }),
        },
      }
      await page.route('**/api/recommendations/store-list', (r) =>
        json(r, body),
      )
      await page.reload()
      await page.locator('h1').first().waitFor({ timeout: 15000 })
      await settle(page)
    },
  )

  await g1b(record, at, spec, on)
  await g1c(record, at, spec, on)
}

const FIXTURE_GAMES = JSON.parse(
  readFileSync(
    new URL('../../fixtures/snapshot/items.json', import.meta.url),
    'utf8',
  ),
)
  .filter((item) => item.type === 'game')
  .map((item) => item.title)

async function guess(page, titles) {
  const box = page.getByRole('combobox', { name: 'Your guess' })
  for (const title of titles) {
    if (await page.locator('.daily-result').count()) return
    await box.fill(title)
    await box.press('Enter')
    await page.waitForTimeout(150)
  }
}

// ---------- g1b: the Daily game and the rest of the shelf ----------
async function g1b(record, at, spec, on) {
  for (const touch of [false, true]) {
    const mode = touch ? 'touch ' : ''
    const daily = spec('/daily', undefined, touch)
    await record(at('b', `${mode}daily option hover`), daily, async (page) => {
      await page.getByRole('combobox', { name: 'Your guess' }).fill('Fixture')
      await page.waitForTimeout(300)
      await on('.guess-list li', 'hover', 1)(page)
    })
    await record(at('b', `${mode}daily mid hover`), daily, async (page) => {
      await guess(page, FIXTURE_GAMES.slice(1, 4))
      await on('.shelfle-cell', 'hover', 2)(page)
    })
  }
  const daily = spec('/daily')
  await record(at('b', 'daily option selected'), daily, async (page) => {
    const box = page.getByRole('combobox', { name: 'Your guess' })
    await box.fill('Fixture')
    await box.press('ArrowDown')
    await page.waitForTimeout(300)
  })
  await record(at('b', 'daily input focus'), daily, async (page) => {
    await page.getByRole('combobox', { name: 'Your guess' }).focus()
    await page.waitForTimeout(300)
  })
  await record(at('b', 'daily full board'), daily, async (page) => {
    await guess(page, FIXTURE_GAMES.slice(1, 7))
  })
  await record(at('b', 'daily disabled input'), daily, async (page) => {
    await guess(page, FIXTURE_GAMES.slice(1, 14))
    await on('.daily-result a', 'focus', 0)(page)
  })
  await record(at('b', 'daily share copy'), daily, async (page) => {
    await guess(page, FIXTURE_GAMES.slice(1, 14))
    await page.getByRole('button', { name: 'Share' }).first().click()
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: 'Copy' }).click()
    await page.waitForTimeout(400)
  })
  await record(
    at('b', 'month link hover'),
    spec('/shelf/year/2025/'),
    on('.month-index a', 'hover', 0),
  )
  await record(
    at('b', 'month link focus'),
    spec('/shelf/year/2025/'),
    on('.month-index a', 'focus', 0),
  )
  await record(
    at('b', 'games footer link hover'),
    spec('/shelf/games'),
    on('.spine-project a', 'hover', 0),
  )
  await record(
    at('b', 'comics footer'),
    spec('/shelf/comics'),
    on('.spine-project a', 'focus', 0),
  )
  await record(
    at('b', 'play next genre chips'),
    spec('/admin/play-next', 'play-next'),
  )
}

// ---------- g1c: the static pages ----------
async function g1c(record, at, spec, on) {
  const about = spec('/about')
  await record(at('c', 'about print'), { ...about, media: 'print' })
  await record(
    at('c', 'about resume focus'),
    about,
    on('.about-aside a', 'focus', 0),
  )
  await record(
    at('c', 'about resume hover'),
    about,
    on('.about-aside a', 'hover', 0),
  )
  for (const path of [
    '/blog/how-my-shelf-works',
    '/til/profile-before-parallelizing-ci',
    '/colophon',
    '/e2e-no-such-page',
  ])
    await record(at('c', `${path} print`), { ...spec(path), media: 'print' })
  await record(
    at('c', 'post link hover'),
    spec('/blog/how-my-shelf-works'),
    on('.post-body a', 'hover', 0),
  )
}
