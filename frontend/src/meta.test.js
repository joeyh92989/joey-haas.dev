import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Not `new URL(..., import.meta.url)`: the jsdom environment overrides URL
// and resolves it against a fake http origin (see About.test.jsx).
const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const html = readFileSync(resolve(frontendDir, 'index.html'), 'utf8')

/** The content of a meta tag, by name or property. */
function meta(key) {
  const match = html.match(
    new RegExp(`<meta\\s+(?:name|property)="${key}"\\s+content="([^"]*)"`),
  )
  return match?.[1]
}

describe('index.html meta', () => {
  it('describes the site and Spine', () => {
    expect(meta('description')).toBe(
      'Joey Haas is a senior software engineer in Denver building payments and ledger systems, and Spine, a tracker for a physical game collection.',
    )
    expect(meta('og:description')).toBe(meta('description'))
  })

  it('carries the Open Graph and card tags', () => {
    expect(meta('og:title')).toBe('Joey Haas')
    expect(meta('og:type')).toBe('website')
    // Static site-wide meta would name the home page canonical for every link.
    expect(meta('og:url')).toBeUndefined()
    expect(meta('og:image')).toBe('https://joey-haas.dev/og-card.png')
    expect(meta('twitter:card')).toBe('summary_large_image')
  })

  // The tag must never point at nothing, and LinkedIn wants 1200×627 or more.
  it('points og:image at a 1200×630 PNG that exists', () => {
    const png = readFileSync(resolve(frontendDir, 'public/og-card.png'))
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
    expect(meta('og:image:width')).toBe('1200')
    expect(meta('og:image:height')).toBe('630')
  })
})
