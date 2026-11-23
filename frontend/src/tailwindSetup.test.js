// @vitest-environment node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { CSS_FILES, readCss } from './testing/readCss.js'

// Read from disk: Vitest stubs CSS imports. Guards the cascade in
// frontend/CLAUDE.md "Design system setup" and src/styles/README.md: the
// hand-written CSS sits in the `base` layer, Preflight in its sublayer
// `base.preflight`, and Tailwind's utilities above both (#536).
const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'tailwind.css'),
  'utf8',
)
const sheets = readCss()
const themeCss = readFileSync(
  createRequire(import.meta.url).resolve('tailwindcss/theme.css'),
  'utf8',
)
// Comments may quote the plain import for the shadcn CLI's check.
const code = css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('tailwind.css setup', () => {
  it('declares the layer order: theme, base, components, utilities', () => {
    expect(code).toContain('@layer theme, base, components, utilities;')
    expect(code).not.toMatch(/legacy/)
  })

  it('imports the hand-written CSS into the base layer, in cascade order', () => {
    const imports = [
      ...code.matchAll(/@import\s+['"]\.\/([^'"]+\.css)['"]\s+layer\(base\)/g),
    ].map((m) => m[1])
    expect(imports).toEqual(CSS_FILES)
  })

  it('imports the shared utilities unlayered, so Tailwind lifts them', () => {
    expect(code).toMatch(/@import\s+['"]\.\/styles\/utilities\.css['"];/)
  })

  // A rule written directly in `base` beats a sublayer's whatever the
  // specificity, so the hand-written element rules (`a`, `h1`, the admin
  // form-control defaults in zero-specificity :where()) beat Preflight's, as
  // they would in a stylesheet that loaded after it. Preflight in plain
  // `base` would let its `button, input { font: inherit; border-radius: 0 }`
  // beat a :where() rule.
  it('imports Preflight first, into the sublayer base.preflight', () => {
    const imports = [
      ...code.matchAll(/@import\s+['"]([^'"]+)['"]\s+layer\(([\w.]+)\)/g),
    ]
    const order = imports.map((m) => `${m[2]}:${m[1]}`)
    expect(order[0]).toBe('base.preflight:tailwindcss/preflight.css')
    expect(order.filter((o) => o.includes('preflight.css'))).toHaveLength(1)
  })

  // Until slice H a block of `revert` rules in base.css handed every Preflight
  // reset back to the browser. Markup that needs a browser value says so
  // itself (a utility, or a rule that names the value).
  it('has no revert shim: no rule hands a reset back to the browser', () => {
    expect(sheets).not.toMatch(/:\s*revert\s*;/)
  })

  // The placeholder is text on a field: --text-3 is pinned at 4.5 or more on
  // --bg, --surface and --sunken in both themes by contrast.test.js.
  it('colours the placeholder with a pinned text token', () => {
    const base = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'styles/base.css'),
      'utf8',
    )
    expect(base).toMatch(/::placeholder\s*\{\s*color: var\(--text-3\);/)
  })

  it('has no unlayered tailwindcss import', () => {
    expect(code).not.toMatch(/@import\s+['"]tailwindcss['"]/)
  })

  it('has no @layer base block', () => {
    expect(code).not.toMatch(/@layer\s+base\s*\{/)
  })

  // Tailwind writes a theme variable into the output once any CSS uses it, in
  // the `theme` layer. The site's :root token of the same name sits in `base`,
  // above it, so it wins; but two declarations of one name drift (body text
  // lost Inter that way in the first draft of #526, when the sheet sat below
  // `theme`). Redeclare any such token in an @theme block here with the
  // site's own value.
  it('redeclares every site token that Tailwind also defines', () => {
    const names = (text) =>
      new Set([...text.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]))
    const collisions = [...names(sheets)].filter((n) => names(themeCss).has(n))
    const themeBlocks = [...code.matchAll(/@theme[^{]*\{([^}]*)\}/g)]
      .map((m) => m[1])
      .join('\n')
    const redeclared = names(themeBlocks)
    expect(collisions.filter((n) => !redeclared.has(n))).toEqual([])
  })
})
