import { describe, expect, it } from 'vitest'
import { BLOG_PAGE, STATIC_PAGES, staticPages } from './pages.js'

describe('STATIC_PAGES', () => {
  it('lists each path once, rooted', () => {
    const paths = STATIC_PAGES.map((page) => page.path)
    expect(new Set(paths).size).toBe(paths.length)
    for (const path of paths) expect(path.startsWith('/')).toBe(true)
  })

  it.each(STATIC_PAGES)('$path has titles and a description', (page) => {
    expect(page.title).toBeTruthy()
    expect(page.headTitle).toBeTruthy()
    expect(page.description).toBeTruthy()
  })

  it('adds the blog only when there are posts', () => {
    expect(staticPages(false)).not.toContain(BLOG_PAGE)
    expect(staticPages(true).at(-1)).toBe(BLOG_PAGE)
  })
})
