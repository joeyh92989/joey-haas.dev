import { describe, expect, it } from 'vitest'
import { BLOG_PAGE, STATIC_PAGES, searchPages, staticPages } from './pages.js'

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

  it('keeps search keywords out of the prerendered fields', () => {
    const daily = STATIC_PAGES.find((page) => page.path === '/daily')
    expect(daily.keywords).toContain('puzzle')
    for (const page of STATIC_PAGES) {
      for (const word of page.keywords ?? []) {
        expect(page.description.toLowerCase()).not.toBe(word)
      }
    }
  })

  it('adds the blog only when there are posts', () => {
    expect(staticPages(false)).not.toContain(BLOG_PAGE)
    expect(staticPages(true).at(-1)).toBe(BLOG_PAGE)
  })
})

describe('searchPages', () => {
  it('adds Resume and Contact for search without making them prerendered pages', () => {
    const titles = searchPages(false).map((page) => page.title)
    expect(titles).toEqual(expect.arrayContaining(['Resume (PDF)', 'Contact']))
    expect(STATIC_PAGES.map((page) => page.path)).not.toContain('/resume.pdf')
  })
})
