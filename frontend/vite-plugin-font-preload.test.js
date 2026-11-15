import { describe, expect, it } from 'vitest'
import { fontPreloadTags } from './vite-plugin-font-preload.js'

const files = [
  'assets/index-abc.js',
  'assets/inter-latin-400-normal-C38fXH4l.woff2',
  'assets/inter-latin-500-normal-Cerq10X2.woff2',
  'assets/inter-latin-600-normal-LgqL8muc.woff2',
  'assets/source-serif-4-latin-500-normal-CUHe9xxf.woff2',
]

describe('fontPreloadTags', () => {
  it('preloads Inter 400 and 500 only, as crossorigin woff2', () => {
    const tags = fontPreloadTags(files)
    expect(tags).toEqual([
      '<link rel="preload" as="font" type="font/woff2" href="/assets/inter-latin-400-normal-C38fXH4l.woff2" crossorigin>',
      '<link rel="preload" as="font" type="font/woff2" href="/assets/inter-latin-500-normal-Cerq10X2.woff2" crossorigin>',
    ])
  })

  it('writes nothing when the fonts are not in the bundle', () => {
    expect(fontPreloadTags(['assets/index-abc.js'])).toEqual([])
  })
})
