import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from './fixtures.js'

const PHONE = { width: 400, height: 800 }
const DESKTOP = { width: 1280, height: 800 }
const POST = '/blog/how-spine-works'

/** The Report-Only CSP exactly as render.yaml ships it. */
function reportOnlyCsp() {
  const yaml = readFileSync(
    resolve(import.meta.dirname, '../../render.yaml'),
    'utf8',
  )
  const match = yaml.match(
    /name: Content-Security-Policy-Report-Only\s+value: "([^"]+)"/,
  )
  if (!match) throw new Error('no report-only CSP in render.yaml')
  return match[1]
}

test.describe('post links and code blocks (#273, #275)', () => {
  for (const path of [POST, '/shelf/how']) {
    test(`${path}: every scrollable pre is focusable and named at 400px`, async ({
      page,
      openRoute,
    }) => {
      await page.setViewportSize(PHONE)
      await openRoute(path, 'dark')
      const bad = await page.$$eval('pre', (pres) =>
        pres
          .filter((pre) => pre.scrollWidth > pre.clientWidth)
          .filter(
            (pre) =>
              pre.getAttribute('tabindex') !== '0' ||
              !(pre.getAttribute('aria-label') || pre.getAttribute('role')),
          )
          .map((pre) => pre.outerHTML.slice(0, 80)),
      )
      expect(bad).toEqual([])
    })
  }

  test('post prose links are underlined', async ({ page, openRoute }) => {
    await openRoute(POST, 'dark')
    const links = await page.$$eval('.prose a, .post-body a', (as) =>
      as.map((a) => getComputedStyle(a).textDecorationLine),
    )
    expect(links.length).toBeGreaterThan(0)
    expect(links.filter((line) => !line.includes('underline'))).toEqual([])
  })
})

test.describe('tap targets at 400px (#276)', () => {
  const FLOOR = 44
  const pages = [
    '/',
    '/shelf/games',
    '/shelf/comics',
    '/shelf/how',
    '/projects',
  ]

  for (const path of pages) {
    test(`${path}: header and page controls are at least ${FLOOR}px high`, async ({
      page,
      openRoute,
    }) => {
      await page.setViewportSize(PHONE)
      await openRoute(path, 'dark')
      if (path === '/shelf/games')
        await expect(page.locator('.chip').first()).toBeVisible()
      const small = await page.evaluate((floor) => {
        const sel =
          'header a, header button, nav a, nav button, .hero-actions a, .chip, button, .shelf-links a, .section-head a, .project-links a, .spine-tabs a'
        const seen = new Set()
        const out = []
        for (const el of document.querySelectorAll(sel)) {
          if (seen.has(el)) continue
          seen.add(el)
          if (el.closest('dialog:not([open])')) continue
          if (el.closest('.prose')) continue
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) continue
          if (el.matches('.skip-link, [class*="skip"]')) continue
          if (r.height < floor)
            out.push(
              `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} "${(el.textContent || '').trim().slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`,
            )
        }
        return out
      }, FLOOR)
      expect(small).toEqual([])
    })
  }
})

test.describe('no sideways scroll at 390px (#475, #482)', () => {
  for (const path of ['/shelf/how', '/']) {
    test(`${path} fits the viewport`, async ({ page, openRoute }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await openRoute(path, 'dark')
      await expect(page.locator('main, .page').first()).toBeVisible()
      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }))
      expect(widths.scroll).toBe(widths.client)
    })
  }
})

test.describe('standalone link targets at 390px (#477)', () => {
  // WCAG 2.2 AA 2.5.8: 24px, or 24px of spacing. Links inside a sentence are
  // exempt; the footer rows and the lone Changes feed link are not sentences.
  const FLOOR = 24
  const PHONE_390 = { width: 390, height: 844 }
  const cases = [
    ['/', '.site-footer a'],
    ['/colophon', '.site-footer a'],
    ['/stats', '.site-footer a, #changes > p a'],
  ]

  for (const [path, selector] of cases) {
    test(`${path}: ${selector} are at least ${FLOOR}px high`, async ({
      page,
      openRoute,
    }) => {
      await page.setViewportSize(PHONE_390)
      await openRoute(path, 'dark')
      await expect(page.locator('.site-footer a').first()).toBeVisible()
      const small = await page.$$eval(
        selector,
        (links, floor) =>
          links
            .map((a) => [a.textContent.trim(), a.getBoundingClientRect()])
            .filter(([, r]) => r.height > 0 && r.height < floor)
            .map(([text, r]) => `${text} ${Math.round(r.height)}px`),
        FLOOR,
      )
      expect(small).toEqual([])
    })
  }
})

test.describe('hero actions in the first viewport (#287)', () => {
  for (const [name, size] of [
    ['400px', PHONE],
    ['1280px', DESKTOP],
  ]) {
    test(`Resume and Email are above the fold at ${name}`, async ({
      page,
      openRoute,
    }) => {
      await page.setViewportSize(size)
      await openRoute('/', 'dark')
      for (const label of [/Resume \(PDF\)/, /Email me/]) {
        const box = await page
          .locator('.hero-actions')
          .getByRole('link', { name: label })
          .boundingBox()
        expect(box, String(label)).not.toBeNull()
        expect(box.y + box.height).toBeLessThanOrEqual(size.height)
      }
    })
  }

  test('search finds Resume and Contact', async ({ page, openRoute }) => {
    await openRoute('/', 'dark')
    await page
      .getByRole('button', { name: /search/i })
      .first()
      .click()
    const input = page.getByRole('combobox', { name: 'Search' })
    for (const [word, hit] of [
      ['resume', 'Resume (PDF)'],
      ['contact', 'Contact'],
    ]) {
      await input.fill(word)
      await expect(
        page.getByRole('option', { name: hit }).first(),
      ).toBeVisible()
    }
  })
})

test.describe('Report-Only CSP (#263)', () => {
  const csp = reportOnlyCsp()
  for (const path of [
    '/',
    '/about',
    '/projects',
    POST,
    '/shelf/how',
    '/stats',
  ]) {
    test(`${path}: no securitypolicyviolation under the shipped policy`, async ({
      page,
      openRoute,
    }) => {
      await page.route(
        (url) =>
          !url.pathname.startsWith('/api/') &&
          url.origin.startsWith('http://localhost'),
        async (route) => {
          if (route.request().resourceType() !== 'document')
            return route.fallback()
          const response = await route.fetch()
          await route.fulfill({
            response,
            headers: {
              ...response.headers(),
              'content-security-policy-report-only': csp,
            },
          })
        },
      )
      await page.addInitScript(() => {
        window.__csp = []
        document.addEventListener('securitypolicyviolation', (e) =>
          window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
        )
      })
      await openRoute(path, 'dark')
      await page.waitForLoadState('networkidle')
      expect(await page.evaluate(() => window.__csp)).toEqual([])
    })
  }
})

test.describe('SpotMap action is a button, not on the image (#275)', () => {
  test('Clear selection is a named, keyboard-reachable button at 400px', async ({
    page,
    openRoute,
  }) => {
    await page.setViewportSize(PHONE)
    await page.route('**/snapshot/spots.json', (route) =>
      route.fulfill({
        json: [
          {
            spot_id: 'a',
            name: 'Union Station',
            slug: 'union-station',
            neighbourhood: 'LoDo',
            tags: [],
            blurb: null,
            lat: 39.7527,
            lng: -105.0003,
          },
        ],
      }),
    )
    await openRoute('/denver', 'dark')
    await page.getByRole('button', { name: 'Map', exact: true }).click()
    await page.locator('.spot-map-pin').first().click()

    const clear = page.getByRole('button', { name: 'Clear selection' })
    await expect(clear).toBeVisible()
    await clear.focus()
    await expect(clear).toBeFocused()
    expect(await clear.getAttribute('tabindex')).not.toBe('-1')

    // The role=img drawing holds no control and takes no focus.
    const image = page.locator('.spot-map-ground[role="img"]')
    await expect(image).toHaveAttribute('aria-label', /.+/)
    expect(await image.locator('button, a, [tabindex]').count()).toBe(0)
    expect(await image.getAttribute('tabindex')).toBeNull()

    await clear.press('Enter')
    await expect(clear).toBeHidden()
  })
})
