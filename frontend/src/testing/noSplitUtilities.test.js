// Tailwind finds classes by scanning source text. A utility built at runtime
// from a constant (`${PHONE}min-h-11`) never appears whole in the source, so the
// stylesheet never gets its rule, and nothing fails: the element just loses
// the style. This guard reads every class module and rejects a template that
// glues an interpolation onto a utility.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..')

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory())
      return name === 'node_modules' ? [] : walk(path)
    return /(Classes|-classes|-variants)\.js$/.test(name) ? [path] : []
  })
}

// An interpolation glued straight onto the next character (`${PHONE}min-h-11`),
// or straight after a variant colon (`md:${X}`), builds a class name at runtime.
const SPLIT = /\$\{[A-Za-z_][\w.]*\}[A-Za-z[@!(-]|:\$\{/

describe('class modules write each utility out whole', () => {
  const files = walk(SRC)
  it('finds the class modules', () => {
    expect(files.length).toBeGreaterThan(10)
  })
  it.each(files.map((f) => [relative(SRC, f), f]))(
    '%s has no split utilities',
    (_name, file) => {
      const lines = readFileSync(file, 'utf8').split('\n')
      const hits = lines
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(
          ({ line }) =>
            !line.trim().startsWith('//') &&
            !line.trim().startsWith('*') &&
            SPLIT.test(line),
        )
      expect(hits.map((h) => `${h.n}: ${h.line.trim()}`)).toEqual([])
    },
  )
})
