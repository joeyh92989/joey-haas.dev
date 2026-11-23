// Painted focus rings, measured in pixels and geometry (#535, #603). One
// module holds the three walks the admin specs use, so the band reads, the
// inspection and the settle exist once:
//  - unringed: focuses each control by script and returns the sides whose
//    6px band outside the control is unchanged by focus (a ring clipped by an
//    ancestor's overflow, or drawn in the page's own colour, leaves the band
//    unchanged). A side whose band would leave the viewport is skipped.
//  - tabRings: reaches every control with real Tab presses, so the browser's
//    own scroll-into-view decides where it lands, then checks geometry (the
//    ring, the box plus the 2px offset and 2px line, inside the viewport and
//    every clipping ancestor) and pixels (the bands, focused against blurred)
//    for every control.
//  - tabRingsByLook: the same walk and checks, but the pixel read runs once
//    per distinct look (tag, classes, input type, and the classes of the
//    clipping ancestors); the geometry check still runs on every control.
// A visually hidden control (a radio inside a chip) is measured on its label.
//
// Where a walk used to sleep a fixed time for the ring's colour transition
// (and any scroll) to finish, it now calls settle(): it waits for the
// page's finite animations and transitions to end and the scroll position to
// hold still across two frames, capped at the old sleep so it never waits
// longer than before.

const BAND = 6

/** Waits for transitions and scrolling to finish, for at most `cap` ms. */
async function settle(page, cap) {
  await page.evaluate((capMs) => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
    const done = (async () => {
      const finite = () =>
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
      await Promise.allSettled(finite().map((a) => a.finished))
      let last = ''
      for (let stable = 0; stable < 2;) {
        await frame()
        const at = `${scrollX},${scrollY},${finite().length}`
        stable = at === last ? stable + 1 : 0
        last = at
      }
    })()
    return Promise.race([
      done,
      new Promise((resolve) => setTimeout(resolve, capMs)),
    ])
  }, cap)
}

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

/** The focused element's name, box, look and the clipping it sits under. */
function inspectWithLook() {
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
    await settle(page, 150)
    await control.evaluate((el) => el.blur())
    await page.mouse.move(1, 1)
    await settle(page, 150)
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
    await settle(page, 150)
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

/** Tabs through every visible control; returns what is wrong, if anything. */
export async function tabRings(page, locator) {
  const problems = []
  const count = await locator.count()
  const handles = []
  for (let i = 0; i < count; i++)
    if (await locator.nth(i).isVisible()) handles.push(locator.nth(i))
  if (!handles.length) return ['no controls found']
  await handles[0].evaluate((el) => el.scrollIntoView({ block: 'center' }))
  // After a mouse click, a script's focus() does not match :focus-visible
  // until the keyboard has been used.
  await page.keyboard.press('Shift')
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
    await settle(page, 200)
    const info = await page.evaluate(inspect)
    if (info.clipped.length)
      problems.push(`${info.name}: ring clipped by ${info.clipped.join(', ')}`)
    if (info.offscreen) problems.push(`${info.name}: ring off the viewport`)
    if (info.box.width <= 0) continue
    const focused = await bands(page, info.box)
    await handles[i].evaluate((el) => el.blur())
    await settle(page, 200)
    const plain = await bands(page, info.box)
    // Only sides visible in both are compared; a clipped side reports above.
    const sides = Object.keys(focused).filter((side) => plain[side])
    for (const side of sides)
      if (focused[side].equals(plain[side]))
        problems.push(`${info.name}:${side}`)
  }
  return problems
}

/** Tabs through every visible control; returns what is wrong, if anything. */
export async function tabRingsByLook(page, locator) {
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
      [inspectWithLook.toString()],
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
        await settle(page, 170)
        const focused = await bands(page, info.box)
        await page.evaluate(() => document.activeElement.blur())
        await settle(page, 170)
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
