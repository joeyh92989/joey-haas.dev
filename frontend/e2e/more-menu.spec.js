import { test, expect } from './fixtures.js'

// The masthead's More (desktop) and the phone sheet's More group (#471):
// Now, Stats, Daily game and Colophon are reachable from the menu.

test('More opens from the masthead and reaches Stats', async ({
  page,
  openRoute,
}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'the phone uses Menu')
  await openRoute('/', 'dark')
  const more = page.getByRole('button', { name: 'More' })
  await expect(more).toHaveAttribute('aria-expanded', 'false')
  await more.click()
  await expect(more).toHaveAttribute('aria-expanded', 'true')
  await page
    .getByRole('navigation', { name: 'Site' })
    .getByRole('link', { name: /^Stats/ })
    .click()
  await expect(page).toHaveURL(/\/stats\/?$/)
})

test('Menu on a phone lists the More group', async ({
  page,
  openRoute,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'desktop uses More')
  await openRoute('/', 'dark')
  await page.getByRole('button', { name: 'Menu' }).click()
  const group = page.getByRole('group', { name: 'More' })
  await expect(group).toBeVisible()
  for (const name of ['Now', 'Stats', 'Daily game', 'Colophon']) {
    await expect(group.getByRole('link', { name })).toBeVisible()
  }
  await group.getByRole('link', { name: 'Stats' }).click()
  await expect(page).toHaveURL(/\/stats\/?$/)
})
