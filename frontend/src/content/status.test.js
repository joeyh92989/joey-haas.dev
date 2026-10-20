// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOAD_ERROR, WAKING } from './status.js'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..') + '/'

/** Every non-test .js/.jsx file under src, as [path, text]. */
function sources(dir = SRC) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    if (!/\.jsx?$/.test(entry.name) || /\.test\.jsx?$/.test(entry.name))
      return []
    return [[path, readFileSync(path, 'utf8')]]
  })
}

describe('status lines', () => {
  const files = sources()

  it.each([
    ['WAKING', WAKING],
    ['LOAD_ERROR', LOAD_ERROR],
  ])('%s is written in status.js and nowhere else', (_, text) => {
    const holders = files
      .filter(([, source]) => source.includes(text))
      .map(([path]) => path.slice(SRC.length))
    expect(holders).toEqual(['content/status.js'])
  })

  // A re-typed copy (straight apostrophe, hyphen for the dash, a wrapped
  // line) slips past the exact match above; these catch the wording itself.
  it.each([
    ['waking', /waking the server/i],
    ['load error', /didn.t load|did not load|could not be loaded/i],
    ['unreachable', /could not be reached|could(?: not|n.t) reach the server/i],
  ])('no page words its own %s line', (_, pattern) => {
    const holders = files
      .filter(([, source]) => pattern.test(source))
      .map(([path]) => path.slice(SRC.length))
    expect(holders).toEqual(['content/status.js'])
  })
})
