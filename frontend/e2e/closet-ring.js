// Painted focus rings, measured in pixels (#535): the pixels in a 6px band
// outside each side of a control are compared before and after keyboard
// focus. A ring clipped by an ancestor's overflow, or drawn in the page's own
// colour, leaves the band unchanged. A side whose band would leave the
// viewport is skipped. A visually hidden control (a radio inside a chip) is
// measured on its label, which is what draws the ring.

const BAND = 6

async function bands(page, box) {
  const view = page.viewportSize()
  const wanted = {
    top: { x: box.x, y: box.y - BAND, width: box.width, height: BAND },
    bottom: { x: box.x, y: box.y + box.height, width: box.width, height: BAND },
    left: { x: box.x - BAND, y: box.y, width: BAND, height: box.height },
    right: { x: box.x + box.width, y: box.y, width: BAND, height: box.height },
  }
  const out = {}
  for (const [side, clip] of Object.entries(wanted)) {
    const inside =
      clip.x >= 0 &&
      clip.y >= 0 &&
      clip.x + clip.width <= view.width &&
      clip.y + clip.height <= view.height
    if (inside && clip.width > 0 && clip.height > 0)
      out[side] = await page.screenshot({ clip })
  }
  return out
}

/** Focuses each control by keyboard; returns the sides with no ring. */
export async function unringed(page, locator) {
  const missing = []
  const count = await locator.count()
  for (let i = 0; i < count; i++) {
    const control = locator.nth(i)
    if (!(await control.isVisible())) continue
    // Centred, so the phone's fixed tab bar never sits over it.
    await control.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    // Focus once first and let any scroll it causes (a sticky bar, a control
    // near an edge) settle, so the band is measured where the control stays.
    await page.keyboard.press('Shift')
    await control.focus()
    await page.waitForTimeout(150)
    await control.evaluate((el) => el.blur())
    await page.mouse.move(1, 1)
    await page.waitForTimeout(150)
    let box = await control.boundingBox()
    // A hidden radio or checkbox: its label draws the ring.
    const hidden = box.width <= 2 || box.height <= 2
    if (hidden) {
      box = await control.evaluate((el) => {
        const r = el.closest('label')?.getBoundingClientRect()
        return r && { x: r.x, y: r.y, width: r.width, height: r.height }
      })
      if (!box) continue
    }
    const before = await bands(page, box)
    await page.keyboard.press('Shift')
    await control.focus()
    // The ring's colour transition (transition-colors) has to finish.
    await page.waitForTimeout(150)
    const moved = await control.boundingBox()
    if (!hidden && Math.abs(moved.y - box.y) > 0.5) {
      missing.push(`${await control.textContent()}: moved on focus`)
      continue
    }
    const after = await bands(page, box)
    const label = (
      (await control.textContent()) ||
      (await control.getAttribute('aria-label')) ||
      (await control.getAttribute('name')) ||
      (await control.evaluate((el) => el.tagName))
    )
      ?.trim()
      .slice(0, 24)
    for (const side of Object.keys(before)) {
      if (before[side].equals(after[side])) missing.push(`${label}:${side}`)
    }
  }
  return missing
}
