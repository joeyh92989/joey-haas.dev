import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  COLORS,
  cardSvg,
  escapeXml,
  loadFaces,
  renderCardPng,
  wrapTitle,
} from './og-card.mjs'

// Ten units a character: 1,040 wide fits 104 characters, so tests are
// independent of the real font.
const measure = (text) => text.length * 10
const fake = {
  width: (_face, text, size) => (text.length * size) / 2,
  path: (face, text) => `M0 0 ${face}:${text.length}`,
}

describe('escapeXml', () => {
  it('escapes & < > and quotes, and leaves curly quotes alone', () => {
    expect(escapeXml(`Tom & Jerry <b> "x" 'y' “curly” ’s`)).toBe(
      'Tom &amp; Jerry &lt;b&gt; &quot;x&quot; &apos;y&apos; “curly” ’s',
    )
  })
})

describe('wrapTitle', () => {
  it('keeps a short title on one line', () => {
    expect(wrapTitle('A short title', measure)).toEqual(['A short title'])
  })

  it('wraps at word boundaries within the width', () => {
    const lines = wrapTitle('aaaa bbbb cccc dddd', measure, { width: 100 })
    expect(lines).toEqual(['aaaa bbbb', 'cccc dddd'])
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(100)
  })

  it('ends the last line in an ellipsis when the title is too long', () => {
    const title = Array.from({ length: 40 }, () => 'word').join(' ')
    const lines = wrapTitle(title, measure, { width: 100, maxLines: 3 })
    expect(lines).toHaveLength(3)
    expect(lines[2].endsWith('…')).toBe(true)
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(100)
  })

  it('cuts a single word wider than a line', () => {
    const [line] = wrapTitle('x'.repeat(50), measure, { width: 100 })
    expect(line.endsWith('…')).toBe(true)
    expect(measure(line)).toBeLessThanOrEqual(100)
  })

  it('does not end a truncated title on stray punctuation', () => {
    const lines = wrapTitle('one two, three four five', measure, {
      width: 80,
      maxLines: 2,
    })
    expect(lines[1]).not.toMatch(/[,.;:]…$/)
  })

  it('returns no lines for an empty title', () => {
    expect(wrapTitle('   ', measure)).toEqual([])
  })
})

describe('cardSvg', () => {
  it('is 1200 by 630 and puts the escaped title in <title>', () => {
    const svg = cardSvg(
      { title: 'Tom & Jerry <3 “quotes”', kind: 'blog', date: '2026-11-15' },
      fake,
    )
    expect(svg).toContain('width="1200" height="630"')
    expect(svg).toContain('<title>Tom &amp; Jerry &lt;3 “quotes”</title>')
    expect(svg).not.toContain('<3')
    expect(svg).toContain(`fill="${COLORS.bg}"`)
  })
})

// WCAG relative luminance, computed here so the claim in og-card.mjs is
// checked, not remembered.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('card colors', () => {
  it.each(['text', 'text2', 'accent'])('%s clears 4.5:1 on the card', (key) => {
    expect(ratio(COLORS[key], COLORS.bg)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('renderCardPng', () => {
  it('draws a 1200 by 630 PNG from the self-hosted faces', async () => {
    const png = await renderCardPng(
      { title: 'How Spine works', kind: 'blog', date: '2026-10-02' },
      await loadFaces(),
    )
    expect([...png.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47])
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
  })

  it('is deterministic', async () => {
    const faces = await loadFaces()
    const card = { title: 'Same title', kind: 'til', date: '2026-11-15' }
    expect(
      (await renderCardPng(card, faces)).equals(
        await renderCardPng(card, faces),
      ),
    ).toBe(true)
  })
})

// The Archive palette (#527): the card and the favicon are paper and ink, the
// light tokens of index.css, so a link preview matches the site it links to.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
function lightToken(name) {
  const css = readFileSync(path.join(root, 'src/index.css'), 'utf8')
  const block = css.match(/\[data-theme='light'\] \{([\s\S]*?)\n\}/)[1]
  return block.match(new RegExp(`--${name}: (#[0-9a-f]{6})`))[1]
}

describe('Archive palette', () => {
  it('draws the card in the light tokens', () => {
    expect(COLORS).toEqual({
      bg: lightToken('bg'),
      text: lightToken('text'),
      text2: lightToken('text-2'),
      accent: lightToken('accent'),
    })
  })

  it('draws the favicon in paper, ink and the accent', () => {
    const svg = readFileSync(path.join(root, 'public/favicon.svg'), 'utf8')
    expect(svg).toContain(`fill="${lightToken('bg')}"`)
    expect(svg).toContain(`stroke="${lightToken('text')}"`)
    expect(svg).toContain(`fill="${lightToken('accent')}"`)
    expect(svg).not.toMatch(/#0f1114|#6ea0ef/)
  })
})

// iOS paints transparent pixels of a home-screen icon black and applies its
// own rounded mask: the touch icon is an opaque full-bleed square.
describe('apple-touch-icon', () => {
  it('is 180px and opaque at every corner and edge', async () => {
    const sharp = (await import('sharp')).default
    const { data, info } = await sharp(
      path.join(root, 'public/apple-touch-icon.png'),
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    expect([info.width, info.height]).toEqual([180, 180])
    const alpha = (x, y) => data[(y * info.width + x) * 4 + 3]
    for (const [x, y] of [
      [0, 0],
      [179, 0],
      [0, 179],
      [179, 179],
      [90, 0],
      [0, 90],
    ])
      expect(alpha(x, y), `${x},${y}`).toBe(255)
  })
})
