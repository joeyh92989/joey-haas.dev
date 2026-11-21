// Painted focus rings by real keyboard navigation, cheaper than
// denver-site-ring.js's tabRings (same checks, fewer pixel reads), so the
// admin data spec fits CI (#535). Every control is reached by pressing Tab,
// so the browser's own scroll-into-view decides where it lands, and each one
// gets the geometry check: its ring (box plus the 2px offset and 2px line)
// inside the viewport and inside every clipping ancestor. The pixel check
// (6px bands outside each side, focused against blurred) runs once per
// distinct look: a control's tag, classes, input type and the classes of the
// clipping ancestors it sits in. A control with the same look as one already
// read paints the same ring, and the geometry check already covers where it
// sits.

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

/** The focused element's name, box, look and the clipping it sits under. */
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
  const clips = []
  for (let p = el.parentElement; p; p = p.parentElement) {
    const s = getComputedStyle(p)
    if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
    clips.push(`${p.tagName}.${String(p.className).slice(0, 60)}`)
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
  return {
    name,
    look: [el.tagName, el.type, el.className, ...clips].join('|'),
    box: { x: r.x, y: r.y, width: r.width, height: r.height },
    clipped,
    offscreen: ring.left < 0 || ring.right > w || ring.top < 0,
  }
}

/** Tabs through every visible control; returns what is wrong, if anything. */
export async function tabRings(page, locator) {
  const problems = []
  const read = new Set()
  // One round trip to mark the controls; the walk then reads only the focused
  // element each time.
  const total = await locator.evaluateAll((els) => {
    window.__ringSet = new Set(
      els.filter((el) => {
        const r = el.getBoundingClientRect()
        return (
          r.width > 0 &&
          r.height > 0 &&
          getComputedStyle(el).visibility !== 'hidden'
        )
      }),
    )
    return window.__ringSet.size
  })
  if (!total) return ['no controls found']
  const first = locator.first()
  await first.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  // After a mouse click, focus() does not match :focus-visible until the
  // keyboard has been used.
  await page.keyboard.press('Shift')
  await first.focus()
  const reached = new Set()
  let presses = 0
  for (;;) {
    const info = await page.evaluate(
      ([inspectSource]) => {
        const fn = new Function(`return (${inspectSource})`)()
        const i = fn()
        i.inSet = window.__ringSet.has(document.activeElement)
        i.index = [...window.__ringSet].indexOf(document.activeElement)
        return i
      },
      [inspect.toString()],
    )
    if (info.inSet && !reached.has(info.index)) {
      reached.add(info.index)
      if (info.clipped.length)
        problems.push(
          `${info.name}: ring clipped by ${info.clipped.join(', ')}`,
        )
      if (info.offscreen) problems.push(`${info.name}: ring off the viewport`)
      if (info.box.width > 0 && !read.has(info.look)) {
        read.add(info.look)
        // The ring's colour eases in (transition-colors, 150ms).
        await page.waitForTimeout(170)
        const focused = await bands(page, info.box)
        await page.evaluate(() => document.activeElement.blur())
        await page.waitForTimeout(170)
        const plain = await bands(page, info.box)
        for (const side of Object.keys(focused).filter((x) => plain[x]))
          if (focused[side].equals(plain[side]))
            problems.push(`${info.name}:${side}`)
        // Back where the walk was, for the next Tab.
        await page.evaluate(
          (index) => [...window.__ringSet][index].focus(),
          info.index,
        )
      }
    }
    if (reached.size >= total || presses >= total * 3 + 10) break
    await page.keyboard.press('Tab')
    presses++
  }
  for (let i = 0; i < total; i++)
    if (!reached.has(i)) problems.push(`control ${i}: Tab never reached it`)
  return problems
}
