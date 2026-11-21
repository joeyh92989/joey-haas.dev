// @vitest-environment node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Now.jsx is in the entry chunk and draws PosterCard in a PosterGrid, so
// everything those two reach must stay free of `cn`, `ui/*` (but the
// -variants and -classes files) and Base UI (#532). designConsistency.test.js
// holds the page files to the same rule; this holds the shelf pieces.
const HERE = dirname(fileURLToPath(import.meta.url))
const BANNED =
  /lib\/utils(\.js)?['"]|from ['"]cn['"]|\/ui\/(?![\w-]*-(variants|classes)\.js['"])[\w-]+(\.jsx?)?['"]|@base-ui|\bcn\(/

const EAGER_SHELF = [
  'PosterCard.jsx',
  'PosterGrid.jsx',
  'shelf-classes.js',
  'RecordCard.jsx',
  'StatusMark.jsx',
  'CatalogueNumber.jsx',
]

describe('the shelf pieces the entry chunk reaches', () => {
  it.each(EAGER_SHELF)('%s imports no cn, ui component or Base UI', (name) => {
    const text = readFileSync(join(HERE, name), 'utf8')
    expect(BANNED.test(text)).toBe(false)
  })
})
