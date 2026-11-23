// The #598 follow-ups' scenarios for style-dump.mjs: one group per fix, each
// dumping the page as the fix leaves it and printing a measurement (a line
// `M <label> <json>` on stderr, the same on both sides) so a before and an
// after can be set side by side. Run the pair with `ONLY=' f598 '`; a scenario
// whose element the page does not draw logs `absent: <selector>`.
//
// Items: (1) prose and plain links take the accent focus ring; (2) the
// replay mark on a dimmed public card passes axe; (3) the Best day detail
// wraps; (4) the quick-rate targets; (5) the admin shell's phone segment
// links and What's next's JumpNav links are 44px with the label centred;
// (6) the spots table and the Tour's bar track; (7) hovered cover tiles are
// not underlined; (8) code takes JetBrains Mono; (9) the date and month
// fields keep their height.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import AxeBuilder from '@axe-core/playwright'

const BOTH = '55555555-bbbb-4bbb-8bbb-000000000005'
const API = resolve(import.meta.dirname, '../../fixtures/api')
const fixture = (name) => readFileSync(resolve(API, name), 'utf8')
const ITEMS = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, '../../fixtures/snapshot/items.json'),
  ),
)

const say = (label, value) =>
  console.error(`M ${label} ${JSON.stringify(value)}`)

/**
 * @param {{record: Function, click: Function}} tools style-dump's own helpers.
 * @param {string} theme
 * @param {string} vp
 */
export async function f598({ record }, theme, vp) {
  const at = (tag, name) => `screen ${theme} ${vp} f598${tag} ${name}`
  const spec = (path, kind, extra = {}) => ({ path, theme, vp, kind, ...extra })
  const settle = async (page) => {
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(300)
  }
  const measured = (label, fn) => async (page) => {
    await settle(page)
    say(`${theme} ${vp} ${label}`, await fn(page))
  }

  // ---------- 1: focus rings on links ----------
  const ring =
    (selector, n = 0) =>
    async (page) => {
      await settle(page)
      const link = page.locator(selector).nth(n)
      if (!(await link.count())) return console.error(`absent: ${selector}`)
      await page.keyboard.press('Tab')
      await link.focus({ focusVisible: true }).catch(() => link.focus())
      await page.waitForTimeout(200)
      say(
        `${theme} ${vp} ring ${selector}`,
        await link.evaluate((a) => {
          const cs = getComputedStyle(a)
          return `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} off ${cs.outlineOffset}`
        }),
      )
    }
  await record(at('1', 'about prose link'), spec('/about'), ring('.prose a', 0))
  await record(
    at('1', 'post link'),
    spec('/blog/how-my-shelf-works'),
    ring('.post-body a', 0),
  )
  await record(at('1', 'colophon link'), spec('/colophon'), ring('.prose a', 0))
  await record(
    at('1', 'projects link'),
    spec('/projects'),
    ring('.project-links a', 0),
  )
  await record(
    at('1', 'tour code link'),
    spec('/shelf/how'),
    ring('main a[href^="http"]', 0),
  )
  await record(at('1', 'now link'), spec('/now'), ring('.prose a', 0))

  // ---------- 2: the replay mark on a dimmed public card ----------
  const replayed = ITEMS.map((item) =>
    item.status === 'finished' ? { ...item, times_completed: 3 } : item,
  )
  const dimmed = spec('/shelf/games', undefined, {
    mock: async (page) => {
      await page.addInitScript(() =>
        localStorage.setItem('shelf.public.dim', 'true'),
      )
      await page.route('**/snapshot/items.json', (route) =>
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(replayed),
        }),
      )
    },
  })
  const replayAxe = async (page) => {
    await settle(page)
    const mark = page.locator('.poster-card[data-dimmed] .replay-mark')
    if (!(await mark.count()))
      return console.error('absent: dimmed replay mark')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .include('.poster-card[data-dimmed]')
      .analyze()
    say(`${theme} ${vp} dimmed card axe`, {
      violations: results.violations.map((v) => `${v.id}:${v.nodes.length}`),
      replayMarks: await mark.count(),
      coverOpacity: await page
        .locator('.poster-card[data-dimmed] .cover')
        .first()
        .evaluate((el) => getComputedStyle(el).opacity),
      artOpacity: await page
        .locator('.poster-card[data-dimmed] .poster-art')
        .first()
        .evaluate((el) => getComputedStyle(el).opacity),
    })
  }
  await record(at('2', 'dimmed replay mark'), dimmed, replayAxe)

  // ---------- 3: the Best day detail ----------
  const analytics = spec('/admin/analytics', 'denver-admin')
  await record(
    at('3', 'analytics tiles'),
    analytics,
    measured('best day detail', (page) =>
      page.evaluate(() => {
        const tiles = [...document.querySelectorAll('.stat-tile')]
        return tiles.map((tile) => {
          const detail = tile.querySelector('.stat-detail')
          const box = tile.getBoundingClientRect()
          const d = detail?.getBoundingClientRect()
          return {
            label: tile.querySelector('dt')?.textContent,
            detail: detail?.textContent,
            detailRight: d ? Math.round(d.right) : null,
            tileRight: Math.round(box.right),
            scrollW: detail?.scrollWidth,
            clientW: detail?.clientWidth,
            clipped: d ? d.right > box.right + 0.5 : false,
          }
        })
      }),
    ),
  )

  // ---------- 4: the quick-rate targets ----------
  const rate = spec('/admin/shelf/games', 'shelf')
  const targets = (selector) => (page) =>
    page.evaluate((sel) => {
      const list = [...document.querySelectorAll(sel)].slice(0, 10)
      return list.map((t) => {
        const r = t.getBoundingClientRect()
        return `${r.width.toFixed(1)}x${r.height.toFixed(1)}`
      })
    }, selector)
  await record(
    at('4', 'quick-rate at rest'),
    rate,
    measured(
      'quick-rate targets (card)',
      targets('.poster-card .quick-rate-target'),
    ),
  )
  if (vp === 'phone')
    await record(
      at('4', 'quick-rate in the sheet'),
      { ...rate, touch: true },
      async (page) => {
        await settle(page)
        await page
          .getByRole('button', { name: /^Actions for / })
          .first()
          .click()
        await page.locator('dialog.shelf-sheet[open]').waitFor()
        await page.waitForTimeout(300)
        say(
          `${theme} ${vp} quick-rate targets (sheet)`,
          await targets('dialog.shelf-sheet .quick-rate-target')(page),
        )
      },
    )

  // ---------- 5: the admin shell's page links, JumpNav ----------
  const labelBox = (selector) => (page) =>
    page.evaluate((sel) => {
      return [...document.querySelectorAll(sel)].slice(0, 6).map((el) => {
        const box = el.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(el.firstChild ?? el)
        const text = range.getBoundingClientRect()
        return {
          text: (el.textContent ?? '').trim().slice(0, 16),
          height: Math.round(box.height * 10) / 10,
          textTopGap: Math.round((text.top - box.top) * 10) / 10,
          textBottomGap: Math.round((box.bottom - text.bottom) * 10) / 10,
        }
      })
    }, selector)
  await record(
    at('5', 'admin segments'),
    spec('/admin/shelf/games', 'shelf'),
    measured(
      'admin segment links',
      labelBox('.admin-subnav a, .admin-subnav button'),
    ),
  )
  await record(
    at('5', 'jump nav'),
    spec('/shelf/next', 'next'),
    measured('jump nav links', labelBox('.jump-nav a')),
  )

  // ---------- 6: the spots table, the Tour's bar track ----------
  await record(
    at('6', 'spots table'),
    spec('/admin/spots', 'denver-admin'),
    measured('spots table fit', (page) =>
      page.evaluate(() => {
        const wrap = document.querySelector('.spots-table')?.parentElement
        return {
          docScroll: document.documentElement.scrollWidth,
          inner: window.innerWidth,
          wrapClient: wrap?.clientWidth,
          wrapScroll: wrap?.scrollWidth,
        }
      }),
    ),
  )
  await record(
    at('6', 'tour bar'),
    spec('/shelf/how'),
    measured('tour bar track', (page) =>
      page.evaluate(() => {
        const bar = document.querySelector('.tour-bar')
        if (!bar) return 'absent'
        const cs = getComputedStyle(bar)
        const fill = getComputedStyle(bar.firstElementChild)
        let ground = bar.parentElement
        while (
          ground &&
          getComputedStyle(ground).backgroundColor === 'rgba(0, 0, 0, 0)'
        )
          ground = ground.parentElement
        return {
          track: cs.backgroundColor,
          border: cs.borderTopColor,
          fill: fill.backgroundColor,
          ground: ground && getComputedStyle(ground).backgroundColor,
        }
      }),
    ),
  )

  // ---------- 7: hovered cover tiles ----------
  const wall = async (page) => {
    await page.route(`**/api/public/items/${BOTH}`, (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: fixture('public-comic-both.json'),
      }),
    )
    await page.route(`**/api/public/items/${BOTH}/issues`, (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: fixture('public-comic-wall-both.json'),
      }),
    )
  }
  await record(
    at('7', 'cover tile hover'),
    spec(`/shelf/${BOTH}`, undefined, { mock: wall }),
    async (page) => {
      await settle(page)
      const tile = page.locator('a.cover-tile').first()
      if (!(await tile.count())) return console.error('absent: a.cover-tile')
      await tile.hover()
      await page.waitForTimeout(300)
      say(
        `${theme} ${vp} cover tile hover decoration`,
        await tile.evaluate((a) => getComputedStyle(a).textDecorationLine),
      )
    },
  )

  // ---------- 8: the code font ----------
  const family = (selector) => (page) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel)
      return el
        ? {
            family: getComputedStyle(el).fontFamily.slice(0, 40),
            size: getComputedStyle(el).fontSize,
            width: Math.round(el.getBoundingClientRect().width),
            height: Math.round(el.getBoundingClientRect().height),
          }
        : 'absent'
    }, selector)
  await record(
    at('8', 'post code'),
    spec('/blog/how-my-shelf-works'),
    async (page) => {
      await settle(page)
      say(
        `${theme} ${vp} post pre code`,
        await family('.post-body pre code')(page),
      )
      say(
        `${theme} ${vp} post inline code`,
        await family('.post-body p code')(page),
      )
    },
  )
  await record(
    at('8', 'tour code'),
    spec('/shelf/how'),
    measured('tour code', family('.tour-code code')),
  )

  // ---------- 9: the date and month fields ----------
  await record(
    at('9', 'wrap-up date'),
    spec('/admin/shelf/games', 'add'),
    async (page) => {
      await settle(page)
      await page
        .getByRole('button', { name: /^Wrap up/ })
        .first()
        .click()
      await page.waitForTimeout(400)
      say(
        `${theme} ${vp} wrap-up date field`,
        await page.evaluate(() =>
          [...document.querySelectorAll('input[type=date]')].map((i) => {
            const r = i.getBoundingClientRect()
            return `${r.width.toFixed(1)}x${r.height.toFixed(1)}`
          }),
        ),
      )
    },
  )
  await record(
    at('9', 'pack month'),
    spec('/admin/closet/review', 'closet'),
    async (page) => {
      await settle(page)
      await page
        .getByRole('button', { name: /^Pack away/ })
        .first()
        .click()
      await page.waitForTimeout(400)
      say(
        `${theme} ${vp} pack month field`,
        await page.evaluate(() =>
          [...document.querySelectorAll('input[type=month]')].map((i) => {
            const r = i.getBoundingClientRect()
            return `${r.width.toFixed(1)}x${r.height.toFixed(1)}`
          }),
        ),
      )
    },
  )
}
