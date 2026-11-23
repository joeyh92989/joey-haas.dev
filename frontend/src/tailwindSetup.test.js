// @vitest-environment node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { CSS_FILES, readCss } from './testing/readCss.js'

// Read from disk: Vitest stubs CSS imports. Guards the coexistence setup in
// frontend/CLAUDE.md "Design system setup": the hand-written CSS sits in the
// `legacy` layer and Preflight in its own layer below it, so unmigrated pages
// do not shift (#526, #536).
const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'tailwind.css'),
  'utf8',
)
const legacy = readCss()
const themeCss = readFileSync(
  createRequire(import.meta.url).resolve('tailwindcss/theme.css'),
  'utf8',
)
// Comments may quote the plain import for the shadcn CLI's check.
const code = css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('tailwind.css setup', () => {
  it('declares the layer order, preflight below legacy', () => {
    expect(code).toContain(
      '@layer preflight, legacy, theme, base, components, utilities;',
    )
  })

  it('imports the hand-written CSS into the legacy layer, in cascade order', () => {
    const imports = [
      ...code.matchAll(
        /@import\s+['"]\.\/([^'"]+\.css)['"]\s+layer\(legacy\)/g,
      ),
    ].map((m) => m[1])
    expect(imports).toEqual(CSS_FILES)
  })

  it('imports the shared utilities unlayered, so Tailwind lifts them', () => {
    expect(code).toMatch(/@import\s+['"]\.\/styles\/utilities\.css['"];/)
  })

  // Preflight in `base` would sit above `legacy` and override every legacy
  // rule that sets the same property. Below it, it only changes what the
  // legacy sheet never sets, and styles/base.css hands those back with
  // `revert`. The last #536 slice moves it to `base`.
  it('imports Preflight into its own layer, below legacy', () => {
    const imports = [
      ...code.matchAll(/@import\s+['"]([^'"]+)['"]\s+layer\((\w+)\)/g),
    ]
    const order = imports.map((m) => `${m[2]}:${m[1]}`)
    expect(order[0]).toBe('preflight:tailwindcss/preflight.css')
    expect(order.filter((o) => o.startsWith('preflight:'))).toHaveLength(1)
  })

  it('restates the browser values Preflight would reset, in zero specificity', () => {
    const base = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'styles/base.css'),
      'utf8',
    )
    for (const selector of [
      ':where(ul, ol, menu)',
      ':where(table)',
      ':where(html)',
    ])
      expect(base).toContain(selector)
    expect(base).toMatch(/:where\(\*\)::before/)
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
  // the `theme` layer, which sits above `legacy`. A legacy :root token with
  // the same name as a Tailwind theme token is then silently replaced: body
  // text lost Inter that way in the first draft of #526. Redeclare any such
  // token in an @theme block here with the site's own value.
  it('redeclares every legacy token that Tailwind also defines', () => {
    const names = (text) =>
      new Set([...text.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]))
    const collisions = [...names(legacy)].filter((n) => names(themeCss).has(n))
    const themeBlocks = [...code.matchAll(/@theme[^{]*\{([^}]*)\}/g)]
      .map((m) => m[1])
      .join('\n')
    const redeclared = names(themeBlocks)
    expect(collisions.filter((n) => !redeclared.has(n))).toEqual([])
  })
})
