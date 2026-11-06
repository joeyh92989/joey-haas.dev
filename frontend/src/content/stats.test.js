import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { COUNTED } from './stats.js'

/** The repo's README, found upward from wherever vitest was started. */
function readme() {
  let dir = process.cwd()
  while (!existsSync(path.join(dir, 'README.md'))) {
    const up = path.dirname(dir)
    if (up === dir) throw new Error('README.md not found')
    dir = up
  }
  return readFileSync(path.join(dir, 'README.md'), 'utf8')
}

const README = readme()

describe('How this is counted', () => {
  it('quotes the README’s Analytics paragraph verbatim', () => {
    // The README wraps lines; the sentences themselves must be identical.
    const flat = README.replace(/\s+/g, ' ')
    expect(flat).toContain(COUNTED.join(' '))
    expect(COUNTED).toHaveLength(4)
  })
})
