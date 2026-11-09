// @vitest-environment node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TAGS, tagLabel } from './denver.js'

/** The `TAGS` tuple from backend/spots.py, the vocabulary's authority. */
function backendTags() {
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  const source = readFileSync(join(repo, 'backend', 'spots.py'), 'utf8')
  const tuple = source.match(/^TAGS: tuple\[str, \.\.\.\] = \(([\s\S]*?)^\)/m)
  if (!tuple) throw new Error('TAGS not found in backend/spots.py')
  return [...tuple[1].matchAll(/"([^"]+)"/g)].map((match) => match[1])
}

describe('Denver tag labels', () => {
  it('label exactly the backend vocabulary, in its order', () => {
    expect(TAGS).toEqual(backendTags())
  })

  it('fall back to the key for an unknown tag', () => {
    expect(tagLabel('kid-ok')).toBe('Kid-OK')
    expect(tagLabel('brunch')).toBe('brunch')
  })
})
