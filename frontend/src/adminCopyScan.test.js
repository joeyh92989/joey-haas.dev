// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { scanSource } from './adminCopyScan.js'
import baseline from './adminCopyBaseline.json'

// Ratchet for #300: admin words belong in content/adminCopy.js. The count of
// inline strings per Admin file may only fall. README -> Admin copy scan.
const SRC = dirname(fileURLToPath(import.meta.url))
const DIRS = ['pages', 'components']

function adminFiles() {
  return DIRS.flatMap((d) =>
    readdirSync(join(SRC, d))
      .filter((f) => /^Admin(?!.*\.test\.).*\.jsx$/.test(f))
      .map((f) => `${d}/${f}`),
  ).sort()
}

function scanAll() {
  return Object.fromEntries(
    adminFiles().map((f) => [
      f,
      scanSource(readFileSync(join(SRC, f), 'utf8')),
    ]),
  )
}

describe('admin copy scan', () => {
  it('finds each kind of inline string', () => {
    const hits = scanSource(
      `<div title="Hi there"><p>Some words</p>{x > 1 && <b>{y}</b>}</div>`,
    )
    expect(hits.map((h) => h.text).sort()).toEqual(['Hi there', 'Some words'])
  })

  it('lets no Admin file gain inline strings beyond its baseline', () => {
    const found = scanAll()
    if (process.env.ADMIN_COPY_LIST) {
      for (const [f, hits] of Object.entries(found)) {
        for (const h of hits)
          console.log(`${f}:${h.line} ${h.kind} "${h.text}"`)
      }
    }
    const problems = []
    for (const [f, hits] of Object.entries(found)) {
      const allowed = baseline[f] ?? 0
      if (hits.length > allowed) {
        const extra = hits
          .map((h) => `  line ${h.line}: ${h.kind} "${h.text}"`)
          .join('\n')
        problems.push(
          `${f} has ${hits.length} inline strings, baseline ${allowed}.\n` +
            `Move the new words into frontend/src/content/adminCopy.js ` +
            `(verbatim) and render adminCopy.<key>. Strings found:\n${extra}`,
        )
      }
    }
    expect(problems.join('\n\n')).toBe('')
  })

  it('keeps the baseline tight: lower it when strings move', () => {
    const found = scanAll()
    const loose = Object.entries(baseline)
      .filter(([f, n]) => (found[f]?.length ?? 0) < n)
      .map(([f, n]) => `${f}: baseline ${n}, now ${found[f]?.length ?? 0}`)
    expect(loose.join('\n')).toBe('')
  })
})
