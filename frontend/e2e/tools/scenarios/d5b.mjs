// Slice D5b's scenarios for style-dump.mjs (#536): the admin intake flow's
// sittings (a comic sitting at Check, Details and Shoot; the Closet's Check
// for garments, a seed file and pasted links) and the remaining Closet and
// item forms. A sitting's answers come from admin-intake.fixtures.js, routed
// over the page's own mocks and then loaded again. A scenario whose element
// the page does not draw logs `absent: <selector>` and is dumped as it
// stands, the same on both sides.
import { serveIntakeD5b } from '../../admin-intake.fixtures.js'

/**
 * @param {{record: Function, click: Function}} tools style-dump's own helpers.
 * @param {string} theme
 * @param {string} vp
 */
export async function d5b({ record, click }, theme, vp) {
  const at = (name) => `screen ${theme} ${vp} d5b ${name}`
  const add = (path) => ({ path, theme, vp, kind: 'admin-add' })
  const closet = (path) => ({ path, theme, vp, kind: 'closet' })
  const closetAdd = (path) => ({ path, theme, vp, kind: 'closet-add' })
  // Route the d5b sittings, load the page again, then run `then`.
  const seen = (selectors, then) => async (page) => {
    await serveIntakeD5b(page)
    await page.reload()
    await page.locator('h1').first().waitFor({ timeout: 15000 })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.evaluate(() => {
      for (const img of document.querySelectorAll('img[loading="lazy"]'))
        img.loading = 'eager'
    })
    await page.waitForTimeout(400)
    if (then) await then(page)
    await page.waitForTimeout(300)
    for (const selector of selectors)
      if (!(await page.locator(selector).count()))
        console.error(`absent: ${selector} (${at('')})`)
  }
  const sitting = (name, path, spec, selectors, then) =>
    record(at(name), spec(path), seen(selectors, then))

  await sitting('comic check', '/admin/collection/add/ck', add, [
    '.intake-checkone',
    '.intake-option',
    '.intake-grow',
    '.intake-book',
    '.intake-book-contents',
    '.intake-adds',
    '.intake-skim li.owned',
    '.intake-typed-books',
    '.conf-exact',
    '.conf-owned',
  ])
  await sitting(
    'comic check tab',
    '/admin/collection/add/ck',
    add,
    [],
    async (page) => {
      for (let i = 0; i < 9; i += 1) await page.keyboard.press('Tab')
      await page.waitForTimeout(500)
    },
  )
  await sitting(
    'comic check grow edit',
    '/admin/collection/add/ck',
    add,
    ['.intake-grow-form'],
    (page) => click(page, /^Edit issues/),
  )
  await sitting(
    'comic check skipped',
    '/admin/collection/add/ck',
    add,
    ['.intake-skim'],
    async (page) => {
      await click(page, /^Skip/)
      await click(page, /^Skip/)
    },
  )
  await sitting('comic details', '/admin/collection/add/cd', add, [
    '.intake-row',
    '.intake-pass',
  ])
  await sitting('shoot all', '/admin/collection/add/sh', add, [
    '.intake-shot-reading',
    '.intake-shot-uploaded',
    '.intake-shot-empty',
    '.intake-shot-failed',
    '.intake-drop',
    '.intake-strip',
  ])
  await sitting(
    'shoot uploading',
    '/admin/collection/add/sh',
    add,
    ['.intake-shot-uploading'],
    async (page) => {
      await page.route('**/api/intake/sittings/sh/photos', () => {})
      await page
        .locator('input[type=file]')
        .first()
        .setInputFiles({
          name: 'new.jpg',
          mimeType: 'image/jpeg',
          buffer: Buffer.from('x'),
        })
      await page.waitForTimeout(500)
    },
  )
  await sitting('closet check', '/admin/closet/add/cl', closetAdd, [
    '.intake-checkone',
    '.intake-garment-photo',
    '.intake-garment-fields',
  ])
  await sitting('closet seed', '/admin/closet/add/cs', closetAdd, [
    '.intake-seed-card',
    '.intake-seed-nophoto',
    '.intake-garment-missing',
  ])
  await sitting(
    'closet seed not-owned',
    '/admin/closet/add/cs',
    closetAdd,
    ['.intake-actions'],
    (page) => click(page, /^Don.t own/),
  )
  await sitting('closet links', '/admin/closet/add/cp', closetAdd, [
    '.intake-link-colors',
    '.intake-link-fields',
    '.intake-seed-card',
  ])
  await record(at('closet add typed bar'), {
    path: '/admin/collection/add',
    theme,
    vp,
    kind: 'admin-add',
  })
  const garment = { path: '/admin/closet/a', theme, vp, kind: 'closet' }
  await record(at('garment form'), garment, async (page) => {
    for (const selector of [
      '.garment-form',
      '.garment-color',
      '.garment-stepper',
      '.garment-attach',
    ])
      if (!(await page.locator(selector).count()))
        console.error(`absent: ${selector} (${at('garment form')})`)
  })
  await record(at('garment form tab'), garment, async (page) => {
    for (let i = 0; i < 14; i += 1) await page.keyboard.press('Tab')
    await page.waitForTimeout(500)
  })
  await record(
    at('profile tab'),
    closet('/admin/closet/profile'),
    async (page) => {
      for (let i = 0; i < 12; i += 1) await page.keyboard.press('Tab')
      await page.waitForTimeout(500)
      if (!(await page.locator('.closet-week-day').count()))
        console.error(`absent: .closet-week-day (${at('profile tab')})`)
    },
  )
  await record(
    at('add kind hover'),
    add('/admin/collection/add'),
    async (page) => {
      await page.locator('.intake-kind').first().hover()
      await page.waitForTimeout(300)
    },
  )
  await record(
    at('add kind tab'),
    add('/admin/collection/add'),
    async (page) => {
      for (let i = 0; i < 4; i += 1) await page.keyboard.press('Tab')
      await page.waitForTimeout(500)
    },
  )
  await record(at('add reduce'), {
    ...add('/admin/collection/add'),
    reduce: true,
  })
  await record(
    at('shoot reduce'),
    { ...add('/admin/collection/add/sh'), reduce: true },
    seen(['.intake-shot-reading']),
  )
}
