// Painted focus rings, measured with real keyboard navigation (#535): each
// control is reached by pressing Tab from the one before it (only the first is
// focused by a call), so the browser's own scroll-into-view decides where it
// lands. Then two checks:
//  - geometry: the ring (the control's box plus the 2px offset and 2px line)
//    must sit inside the viewport and inside every clipping ancestor
//    (overflow other than visible) — a control half-scrolled under its
//    wrapper's edge fails here;
//  - pixels: the 6px bands outside each side are compared with the control
//    focused and again after blur (blur does not scroll), so a ring drawn in
//    the page's own colour leaves the band unchanged and fails.
// A visually hidden control (a radio inside a chip) is measured on its label.

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

/** The focused element's name, box, and the clipping it sits under. */
function inspect() {
  const el = document.activeElement
  const name = (
    el.textContent ||
    el.getAttribute('aria-label') ||
    el.getAttribute('name') ||
    el.tagName
  )
    .trim()
    .slice(0, 24)
  let r = el.getBoundingClientRect()
  if (r.width <= 2 || r.height <= 2) {
    const label = el.closest('label')
    if (label) r = label.getBoundingClientRect()
  }
  const ring = {
    left: r.left - 4,
    top: r.top - 4,
    right: r.right + 4,
    bottom: r.bottom + 4,
  }
  const clipped = []
  for (let p = el.parentElement; p; p = p.parentElement) {
    const s = getComputedStyle(p)
    if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
    const c = p.getBoundingClientRect()
    const x = s.overflowX !== 'visible'
    const y = s.overflowY !== 'visible'
    if (
      (x && (ring.left < c.left - 0.5 || ring.right > c.right + 0.5)) ||
      (y && (ring.top < c.top - 0.5 || ring.bottom > c.bottom + 0.5))
    )
      clipped.push(`${p.tagName}.${String(p.className).slice(0, 40)}`)
  }
  const w = document.documentElement.clientWidth
  const offscreen = ring.left < 0 || ring.right > w || ring.top < 0
  return {
    name,
    box: { x: r.x, y: r.y, width: r.width, height: r.height },
    clipped,
    offscreen,
  }
}

/** Tabs through every visible control; returns what is wrong, if anything. */
export async function tabRings(page, locator) {
  const problems = []
  const count = await locator.count()
  const handles = []
  for (let i = 0; i < count; i++)
    if (await locator.nth(i).isVisible()) handles.push(locator.nth(i))
  if (!handles.length) return ['no controls found']
  await handles[0].evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await handles[0].focus()
  for (let i = 0; i < handles.length; i++) {
    if (i > 0) {
      let hit = false
      for (let tries = 0; tries < 4 && !hit; tries++) {
        await page.keyboard.press('Tab')
        hit = await handles[i].evaluate((el) => el === document.activeElement)
      }
      if (!hit) {
        problems.push(`control ${i}: Tab never reached it`)
        await handles[i].focus()
      }
    }
    await page.waitForTimeout(200)
    const info = await page.evaluate(inspect)
    if (info.clipped.length)
      problems.push(`${info.name}: ring clipped by ${info.clipped.join(', ')}`)
    if (info.offscreen) problems.push(`${info.name}: ring off the viewport`)
    if (info.box.width <= 0) continue
    const focused = await bands(page, info.box)
    await handles[i].evaluate((el) => el.blur())
    await page.waitForTimeout(200)
    const plain = await bands(page, info.box)
    // Only sides visible in both are compared; a clipped side reports above.
    const sides = Object.keys(focused).filter((side) => plain[side])
    for (const side of sides)
      if (focused[side].equals(plain[side]))
        problems.push(`${info.name}:${side}`)
  }
  return problems
}
