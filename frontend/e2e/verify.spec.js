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
      if (path.startsWith('/shelf/') && path !== '/shelf/how')
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
