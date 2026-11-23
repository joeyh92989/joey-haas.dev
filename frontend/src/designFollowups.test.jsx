import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import JumpNav from './components/JumpNav.jsx'
import { readCss } from './testing/readCss.js'
import { POSTER_DIMMED } from './components/shelf-classes.js'
import { STAT_DETAIL } from './components/overview-classes.js'
import { segmentLink } from './components/adminShellClasses.js'
import { tileClass } from './components/comicClasses.js'
import { DRAWN_MAP_PIN, TRIP_CARD } from './components/travelClasses.js'
import { WRAP_DATE } from './components/wrapUpClasses.js'
import { PACK_INPUT } from './components/closetReviewClasses.js'

// The small fixes from #598 (the design-system follow-ups), pinned as class
// strings and CSS text: jsdom paints nothing, so the measurements are in
// `e2e/followups-598.spec.js` and the style dump's `f598` scenarios.

const src = (file) => readFileSync(join(import.meta.dirname, file), 'utf8')
const tokens = (classes) => classes.split(/\s+/)

describe('#598 follow-ups', () => {
  it('draws a link with no ring of its own in the accent ring', () => {
    const base = readCss(['styles/base.css'])
    const rule = base.match(/a:focus-visible\s*\{([^}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule[1]).toMatch(/outline:\s*2px solid var\(--accent\)/)
    expect(rule[1]).toMatch(/outline-offset:\s*2px/)
  })

  it('dims only the cover of a finished card, so its marks keep their contrast', () => {
    expect(POSTER_DIMMED).toContain('.poster-art_.cover]:opacity-45')
    expect(POSTER_DIMMED).not.toMatch(/\.poster-art\]:opacity/)
    expect(src('components/shelf-classes.js')).not.toContain(
      'POSTER_DIMMED_COVER',
    )
  })

  it('wraps a stat tile detail anywhere, so a long referrer is not clipped', () => {
    expect(tokens(STAT_DETAIL)).toContain('[overflow-wrap:anywhere]')
  })

  it('makes the shell page links 44px, and the label centres in the flex box', () => {
    expect(tokens(segmentLink)).toContain('min-h-11')
    expect(tokens(segmentLink)).not.toContain('min-h-9')
    // The ghost button look is inline-flex with items-center.
    expect(segmentLink).toContain('inline-flex')
    expect(segmentLink).toContain('items-center')
  })

  it('centres a phone jump link in its 44px box and keeps the space before its count', () => {
    render(
      <JumpNav
        items={[
          { id: 'a', label: 'Tonight' },
          { id: 'b', label: 'In stores now', count: 2 },
        ]}
      />,
    )
    const link = screen.getByRole('link', { name: /In stores now/ })
    const classes = tokens(link.className)
    expect(classes).toContain('[@media(max-width:700px)]:min-h-11')
    expect(classes).toContain('[@media(max-width:700px)]:leading-[2.75rem]')
    // A flex box would collapse the space at the start of the count's span.
    expect(classes.filter((c) => /:flex$/.test(c))).toEqual([])
    expect(link.textContent).toBe('In stores now 2')
  })

  it('does not underline a hovered card, tile or map pin', () => {
    expect(tokens(TRIP_CARD)).toContain('[&:hover]:no-underline')
    expect(tokens(DRAWN_MAP_PIN)).toContain('[&:hover]:no-underline')
    expect(tokens(tileClass({ state: 'owned', link: true }))).toContain(
      '[&:hover]:no-underline',
    )
  })

  it('sets code in the site mono face, not the browser default', () => {
    expect(readCss(['styles/post-body.css'])).toMatch(
      /\.post-body :is\(code, pre\)\s*\{\s*font-family:\s*var\(--font-mono\)/,
    )
    for (const file of ['components/Stop.jsx', 'pages/AdminCatalogue.jsx']) {
      expect(src(file)).toContain('[font-family:var(--font-mono)]')
      expect(src(file)).not.toContain('[font-family:monospace]')
    }
  })

  it('puts the date fields 1px back on the WebKit parts only', () => {
    for (const classes of [WRAP_DATE, PACK_INPUT]) {
      expect(tokens(classes)).toContain('[&::-webkit-datetime-edit]:py-px')
      // No compensation on the input itself: Firefox has no such parts.
      expect(classes).not.toMatch(/py-\[calc\(/)
    }
  })
})
