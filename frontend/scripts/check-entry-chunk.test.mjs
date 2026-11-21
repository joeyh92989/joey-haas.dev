import { describe, expect, it } from 'vitest'
import { entryChunkPath, findMarkers } from './check-entry-chunk.mjs'

describe('check-entry-chunk', () => {
  it('finds the entry script in a built index.html', () => {
    expect(
      entryChunkPath(
        '<script type="module" crossorigin src="/assets/index-AbC_12-x.js"></script>',
      ),
    ).toBe('/assets/index-AbC_12-x.js')
    expect(
      entryChunkPath('<script src="/assets/other.js"></script>'),
    ).toBeNull()
  })

  it('flags a chunk that carries the tailwind-merge tables', () => {
    expect(findMarkers('const t={orderSensitiveModifiers:[]}')).toEqual([
      'orderSensitiveModifiers',
    ])
    expect(findMarkers('const x = 1')).toEqual([])
  })
})
