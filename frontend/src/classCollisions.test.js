// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buttonVariants, mastButton } from './components/ui/button-variants.js'
import { badgeVariants } from './components/ui/badge-variants.js'
import * as shelf from './components/shelf-classes.js'
import * as detail from './components/detail-classes.js'
import * as prose from './components/prose-classes.js'
import * as siteAdmin from './components/siteAdminClasses.js'
import * as home from './components/adminHomeClasses.js'
import * as adminData from './components/adminDataClasses.js'
import * as adminShelf from './components/adminShelfClasses.js'
import * as adminShell from './components/adminShellClasses.js'
import * as closet from './components/closetClasses.js'

// A class string joined with `cx` or a template has no merge, so two utilities
// of one family under one variant (`aria-pressed:bg-card` and
// `aria-pressed:bg-foreground`) both reach the sheet and the later one in
// the sheet wins, not the later one in the string (#533: a pressed chip drew
// ink on ink). `cn` merges and is exempt; an `!` marks a deliberate override.

const SRC = dirname(fileURLToPath(import.meta.url))
const TEXT_COLOURS =
  /^(foreground|background|muted-foreground|primary|primary-foreground|card-foreground|secondary-foreground|accent-foreground|accent-text|ok-text|warn-text|destructive|highlight-ink|inherit|current)$/
const BORDER_COLOURS =
  /^(foreground|border|line-card|primary|transparent|destructive|input|muted-foreground|ring)$/

/** Splits a token into its variant prefix and utility, outside brackets. */
function split(token) {
  let depth = 0
  let cut = -1
  for (let i = 0; i < token.length; i++) {
    if (token[i] === '[') depth++
    else if (token[i] === ']') depth--
    else if (token[i] === ':' && depth === 0) cut = i
  }
  return [token.slice(0, cut + 1), token.slice(cut + 1)]
}

/** The family a utility sets a colour in, or null. */
function family(utility) {
  const name = utility.replace(/!$/, '').replace(/^!/, '')
  if (name.startsWith('bg-') && !name.startsWith('bg-[')) return 'bg'
  if (name.startsWith('text-') && TEXT_COLOURS.test(name.slice(5)))
    return 'text'
  if (name.startsWith('border-') && BORDER_COLOURS.test(name.slice(7)))
    return 'border'
  return null
}

/** Colour utilities set twice under one variant, neither marked `!`. */
export function collisions(classString) {
  const seen = new Map()
  const found = []
  for (const token of classString.split(/\s+/).filter(Boolean)) {
    const [prefix, utility] = split(token)
    const fam = family(utility)
    if (!fam || utility.startsWith('!') || utility.endsWith('!')) continue
    const key = `${prefix}|${fam}`
    if (seen.has(key) && seen.get(key) !== token) {
      found.push(`${seen.get(key)} / ${token}`)
    }
    seen.set(key, token)
  }
  return found
}

const CONSTANTS = { ...shelf, ...detail, ...prose, ...home }

// A class module's own constants win inside it (PANEL, TH and PRIMARY are
// named in several), so a statement in one resolves against that module.
const OWN = {
  'adminDataClasses.js': adminData,
  'adminShelfClasses.js': adminShelf,
  'adminShellClasses.js': adminShell,
  'closetClasses.js': closet,
  'adminHomeClasses.js': home,
  'siteAdminClasses.js': siteAdmin,
}

// Families a variant's own string and a literal joined to it can both set:
// padding, gap and font size. Colours are checked on the whole string above.
const SPACING = /^(p|px|py|pt|pr|pb|pl|gap|gap-x|gap-y)-/
const FONT_SIZE = /^text-(xs|sm|base|lg|xl|[2-9]xl|\[[\d.]+(rem|px|em)\])$/

/** The family a token sets, keyed with its variant prefix, or null. */
function sizeKey(token) {
  const [prefix, utility] = split(token)
  if (utility.startsWith('!') || utility.endsWith('!')) return null
  const group =
    SPACING.exec(utility)?.[1] ?? (FONT_SIZE.test(utility) && 'text')
  return group ? `${prefix}|${group}` : null
}

/** Padding, gap and font-size utilities set again by a later part: a part's
 *  own string (a variant's size and its base) is its business, but a literal
 *  joined to it is not merged, so the sheet's order picks the winner. */
export function sizeClashes(parts) {
  const seen = new Map()
  const found = []
  for (const part of parts) {
    const own = new Map()
    for (const token of part.split(/\s+/).filter(Boolean)) {
      const key = sizeKey(token)
      if (!key) continue
      if (seen.has(key) && seen.get(key) !== token)
        found.push(`${seen.get(key)} / ${token}`)
      own.set(key, token)
    }
    for (const [key, token] of own) seen.set(key, token)
  }
  return found
}

/** The class strings a statement builds: its literals and known constants,
 *  with `buttonVariants(...)` and friends evaluated. */
function evaluate(statement, own = {}) {
  const parts = []
  for (const m of statement.matchAll(
    /(buttonVariants|badgeVariants)\(\{([^}]*)\}\)/g,
  )) {
    const args = Object.fromEntries(
      [...m[2].matchAll(/(\w+):\s*'([^']+)'/g)].map((a) => [a[1], a[2]]),
    )
    parts.push(
      (m[1] === 'buttonVariants' ? buttonVariants : badgeVariants)(args),
    )
  }
  for (const m of statement.matchAll(/mastButton\((?:'(\w+)')?\)/g)) {
    parts.push(mastButton(m[1]))
  }
  for (const m of statement.matchAll(/['"`]([^'"`]*)['"`]/g)) parts.push(m[1])
  // The Site helpers (#535): a constant spliced into a template,
  // `${box} text-sm ...`.
  for (const m of statement.matchAll(/\$\{(\w+)\}/g)) {
    if (typeof own[m[1]] === 'string') parts.push(own[m[1]])
    else if (typeof siteAdmin[m[1]] === 'string') parts.push(siteAdmin[m[1]])
  }
  for (const m of statement.matchAll(/\b([A-Z][A-Z_]{3,})\b/g)) {
    if (typeof own[m[1]] === 'string') parts.push(own[m[1]])
    else if (typeof CONSTANTS[m[1]] === 'string') parts.push(CONSTANTS[m[1]])
  }
  return parts
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path)
    return /\.jsx?$/.test(entry.name) && !/\.test\./.test(entry.name)
      ? [path]
      : []
  })
}

/** Each statement that calls a variant helper and joins without a merge. */
function joined(text) {
  const lines = text.split('\n')
  const out = []
  lines.forEach((line, i) => {
    if (
      !/(buttonVariants|badgeVariants|mastButton)\(|\$\{(box|field|textarea|pill|checkbox|chipBtn|tagBtn)\}/.test(
        line,
      )
    )
      return
    let start = i
    while (start > 0 && !/^\s*(const|export|className=|<)/.test(lines[start]))
      start--
    let end = i
    while (
      end < lines.length - 1 &&
      end < i + 12 &&
      lines[end + 1].trim() !== '' &&
      !/^\s*(const|export|function|import)\b/.test(lines[end + 1])
    )
      end++
    const statement = lines.slice(start, end + 1).join('\n')
    if (/\bcn\(/.test(statement)) return
    out.push({ line: start + 1, statement })
  })
  return out
}

describe('class strings joined without a merge', () => {
  it('finds a same-variant colour clash (the #533 bug)', () => {
    expect(
      collisions(
        'aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:bg-foreground aria-pressed:text-background',
      ),
    ).toEqual([
      'aria-pressed:bg-card / aria-pressed:bg-foreground',
      'aria-pressed:text-foreground / aria-pressed:text-background',
    ])
    expect(collisions('bg-card hover:bg-foreground text-sm text-left')).toEqual(
      [],
    )
    expect(collisions('bg-card bg-foreground!')).toEqual([])
  })

  it('keeps every button and badge variant free of clashes on its own', () => {
    for (const variant of [
      'default',
      'outline',
      'secondary',
      'ghost',
      'destructive',
      'chip',
      'quiet',
      'nav',
      'link',
    ]) {
      expect(collisions(buttonVariants({ variant })), variant).toEqual([])
    }
    for (const variant of ['default', 'outline', 'accent']) {
      expect(collisions(badgeVariants({ variant })), variant).toEqual([])
    }
  })

  it('finds a padding or font-size clash between a variant and a literal', () => {
    expect(
      sizeClashes([
        buttonVariants({ variant: 'outline', size: 'lg' }),
        'min-w-11 px-4',
      ]),
    ).toEqual(['px-5 / px-4'])
    // One part's own base and size are not a join; an `!` is deliberate.
    expect(sizeClashes([buttonVariants({ size: 'sm' }), 'min-w-11'])).toEqual(
      [],
    )
    expect(sizeClashes(['h-9 px-4', 'text-base!', 'text-sm'])).toEqual([])
  })

  it('keeps the admin Home and Jobs strings free of clashes (#535)', () => {
    for (const [name, value] of Object.entries(home)) {
      expect(collisions(value), name).toEqual([])
    }
  })

  it('builds no clash by joining a variant with other classes in src', () => {
    const bad = []
    for (const path of walk(SRC)) {
      for (const { line, statement } of joined(readFileSync(path, 'utf8'))) {
        const parts = evaluate(statement, OWN[path.split('/').pop()])
        // The size check reads the statement alone, up to the next element.
        const alone = evaluate(
          statement.split(/\n(?=\s*[<)])/)[0],
          OWN[path.split('/').pop()],
        )
        const clash = [
          ...collisions(parts.join(' ')),
          ...new Set(sizeClashes(alone)),
        ]
        if (clash.length) bad.push(`${relative(SRC, path)}:${line} ${clash}`)
      }
    }
    expect(bad).toEqual([])
  })
})
