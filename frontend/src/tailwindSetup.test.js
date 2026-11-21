// @vitest-environment node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { CSS_FILES, readCss } from './testing/readCss.js'

// Read from disk: Vitest stubs CSS imports. Guards the coexistence setup in
// frontend/CLAUDE.md "Design system setup": index.css sits in the lowest
// layer, and Preflight stays off, so unmigrated pages do not shift (#526).
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
  it('declares the layer order, legacy lowest', () => {
    expect(code).toContain('@layer legacy, theme, base, components, utilities;')
  })

  it('imports the hand-written CSS into the legacy layer, in cascade order', () => {
    const imports = [
      ...code.matchAll(
        /@import\s+['"]\.\/([^'"]+\.css)['"]\s+layer\(legacy\)/g,
      ),
    ].map((m) => m[1])
    expect(imports).toEqual(CSS_FILES)
  })

  it('never imports Preflight', () => {
    expect(code).not.toMatch(/preflight/)
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
