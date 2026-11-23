import { test, expect } from './fixtures.js'
import { GAMES, serveAdmin } from './admin-shelf.fixtures.js'
import { serveAdminAdd } from './admin-add.fixtures.js'
import { mockCloset } from './closet-mocks.js'

// Admin list toolbars (#495) and the shared table wrap (#459), with mocked
// answers and no backend: the add bar's placeholder is read whole at the
// phone widths, every control in it shows a word, the header's bulk actions
// are a group of their own that a confirm cannot re-wrap, and the list view's
// table scrolls inside its wrapper instead of widening the page.
test.skip(!!process.env.E2E_BASE_URL, 'mocked answers only')

const PHONES = [320, 390]

test.beforeEach(({ browserName }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop' || browserName !== 'chromium',
    'sets its own viewport',
  )
})

/** Inputs whose placeholder is wider than the room the field gives it. */
function clippedPlaceholders(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('main input[placeholder]')]
      .filter((input) => input.getBoundingClientRect().width > 0)
      .filter((input) => {
        const style = getComputedStyle(input)
        const ctx = document.createElement('canvas').getContext('2d')
        ctx.font = `${style.fontSize} ${style.fontFamily}`
        const room =
          input.clientWidth -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight)
        return ctx.measureText(input.placeholder).width > room
      })
      .map((input) => input.placeholder),
  )
}

/** Buttons in the add bar with no visible text (a glyph alone). */
function nameless(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.intake-addbar button')]
      .filter((button) => {
        const visible = [...button.childNodes]
          .filter(
            (node) =>
              node.nodeType === 3 ||
              (node.nodeType === 1 && !node.hasAttribute('aria-hidden')),
          )
          .map((node) => node.textContent)
          .join('')
          .trim()
        return !visible
      })
      .map((button) => button.getAttribute('aria-label')),
  )
}

for (const width of PHONES) {
  test(`Closet add bar reads whole and names every button at ${width}px`, async ({
    page,
    openRoute,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await serveAdminAdd(page)
    await mockCloset(page)
    await openRoute('/admin/closet', 'light')
    await expect(page.locator('.intake-addbar')).toBeVisible()
    expect(await clippedPlaceholders(page)).toEqual([])
    expect(await nameless(page)).toEqual([])
    // "From links" is a button beside the others, not a full-width row.
    const links = page.getByRole('button', { name: 'Add from product links' })
    const photos = page.getByRole('button', { name: 'Add from photos' })
    expect((await links.boundingBox()).width).toBeLessThan(width / 2)
    expect((await photos.boundingBox()).width).toBeLessThan(width / 2)
  })

  test(`Games header groups its bulk actions at ${width}px`, async ({
    page,
    openRoute,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await serveAdmin(page, GAMES)
    await openRoute('/admin/shelf/games', 'light')
    await expect(page.locator('.poster-card').first()).toBeVisible()
    expect(await clippedPlaceholders(page)).toEqual([])
    const bulk = page.getByRole('group', { name: 'Bulk actions' })
    for (const name of [/^Publish all/, 'Hide all', /^Refresh .* metadata/])
      await expect(bulk.getByRole('button', { name })).toBeVisible()
    await expect(
      page.getByRole('group', { name: 'Bulk actions' }).getByRole('link'),
    ).toHaveCount(0)
    // Opening the publish confirm re-wraps only its own group.
    const add = page.getByRole('link', { name: 'Add games' })
    const before = await add.boundingBox()
    await bulk.getByRole('button', { name: /^Publish all/ }).click()
    expect(await add.boundingBox()).toEqual(before)
  })
}

test('Games list view table stays inside its wrapper on a phone', async ({
  page,
  openRoute,
}) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await serveAdmin(page, GAMES)
  await page.addInitScript(() =>
    localStorage.setItem('shelf.admin.view', JSON.stringify('list')),
  )
  await openRoute('/admin/shelf/games', 'light')
  await expect(page.locator('.item-table').first()).toBeVisible()
  const result = await page.evaluate(() => {
    const wrap = document.querySelector('.item-table-wrap')
    return {
      position: getComputedStyle(wrap).position,
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    }
  })
  expect(result.position).toBe('relative')
  expect(result.overflow).toBe(0)
})
