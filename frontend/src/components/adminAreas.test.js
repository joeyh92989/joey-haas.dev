import { describe, expect, it } from 'vitest'
import {
  ADMIN_AREAS,
  areaFor,
  currentPage,
  pageFor,
  segmentsFor,
} from './adminAreas.js'
import appSource from '../App.jsx?raw'

/** The fixed admin paths in App.jsx, read the way prerender-lib's test does. */
function appAdminPaths() {
  const admin = appSource.match(/^( *)<Route path="admin"[\s\S]*?^\1<\/Route>/m)
  const block = admin[0].slice(admin[0].indexOf('\n'))
  const children = [...block.matchAll(/<Route path="([^":*]+)"/g)].map(
    ([, route]) => `/admin/${route}`,
  )
  return block.includes('<Route index') ? ['/admin', ...children] : children
}

const owned = (area) => area.pages.filter((page) => !page.alias)

describe('ADMIN_AREAS', () => {
  it('lists the areas in their fixed order', () => {
    expect(ADMIN_AREAS.map((area) => area.label)).toEqual([
      'Home',
      'Shelf',
      'Closet',
      'Denver',
      'Site',
    ])
  })

  it('puts every fixed admin route in App.jsx in exactly one area', () => {
    const paths = appAdminPaths()
    for (const path of paths) {
      const homes = ADMIN_AREAS.filter((area) =>
        owned(area).some((page) => page.to === path),
      )
      expect(
        homes.map((area) => area.key),
        path,
      ).toHaveLength(1)
    }
  })

  it('routes every page it lists, aliases included', () => {
    const paths = new Set(appAdminPaths())
    for (const area of ADMIN_AREAS) {
      for (const page of area.pages) expect(paths, page.to).toContain(page.to)
    }
  })

  it('lands each area on one of its own pages', () => {
    for (const area of ADMIN_AREAS) {
      expect(
        owned(area).map((page) => page.to),
        area.key,
      ).toContain(area.home)
    }
  })

  it('resolves every phone segment and sheet to a page', () => {
    for (const area of ADMIN_AREAS) {
      for (const segment of segmentsFor(area)) {
        if (segment.sheet) {
          for (const page of segment.sheet) expect(page).not.toBeNull()
        } else {
          expect(segment.to).toBeTruthy()
        }
      }
    }
  })

  it('keeps every Shelf page in one of its three groups, in runs', () => {
    const shelf = ADMIN_AREAS.find((area) => area.key === 'shelf')
    const runs = shelf.pages
      .map((page) => page.group)
      .filter((group, i, all) => group !== all[i - 1])
    expect(runs).toEqual(['Collection', 'Recommend', 'Catalogue'])
  })
})

describe('Add pages', () => {
  it("badge each area's Add page with its entries left to check", () => {
    const badged = ADMIN_AREAS.flatMap((area) =>
      area.pages.filter((page) => page.badge).map((page) => [area.key, page]),
    )
    expect(badged.map(([key, page]) => [key, page.to, page.badge])).toEqual([
      ['shelf', '/admin/collection/add', 'intake.shelf'],
      ['closet', '/admin/closet/add', 'intake.closet'],
    ])
  })

  it('no longer lists Import photos', () => {
    const paths = ADMIN_AREAS.flatMap((area) => area.pages.map((p) => p.to))
    expect(paths).not.toContain('/admin/import')
  })

  it("puts Add in the Shelf's phone segments, after Collection", () => {
    const shelf = ADMIN_AREAS.find((area) => area.key === 'shelf')
    expect(segmentsFor(shelf).map((segment) => segment.label)).toEqual([
      'Collection',
      'Add',
      'Picks',
      'Sources',
      'More',
    ])
  })
})

describe('areaFor', () => {
  it.each([
    ['/admin', 'home', 'Home'],
    ['/admin/', 'home', 'Home'],
    ['/admin/jobs', 'home', 'Jobs'],
    ['/admin/collection', 'shelf', 'Collection'],
    ['/admin/collection/42', 'shelf', 'Collection'],
    ['/admin/collection/add', 'shelf', 'Add'],
    ['/admin/collection/add/abc', 'shelf', 'Add'],
    ['/admin/closet/add', 'closet', 'Add'],
    ['/admin/closet/add/abc', 'closet', 'Add'],
    ['/admin/play-next', 'shelf', 'Play Next'],
    ['/admin/discover', 'shelf', 'Discover'],
    ['/admin/radar', 'shelf', 'Radar'],
    ['/admin/pull-list', 'shelf', 'Pull list'],
    ['/admin/catalogue', 'shelf', 'Sources'],
    ['/admin/store-list', 'shelf', 'Store list'],
    ['/admin/weekend', 'denver', 'Weekend'],
    ['/admin/spots', 'denver', 'Spots'],
    ['/admin/analytics', 'site', 'Analytics'],
  ])('puts %s in %s on %s', (path, key, label) => {
    const area = areaFor(path)
    expect(area.key).toBe(key)
    expect(pageFor(area, path).label).toBe(label)
  })

  it('falls back to Home for an unknown admin path, with no page', () => {
    const area = areaFor('/admin/nowhere')
    expect(area.key).toBe('home')
    expect(pageFor(area, '/admin/nowhere')).toBeNull()
  })

  it('does not take /admin/collectionx for the collection', () => {
    expect(areaFor('/admin/collectionx').key).toBe('home')
  })
})

describe('currentPage', () => {
  const closet = ADMIN_AREAS.find((area) => area.key === 'closet')

  it('is the longest matching page', () => {
    expect(currentPage(closet.pages, '/admin/closet/profile').label).toBe(
      'Profile',
    )
    expect(currentPage(closet.pages, '/admin/closet/12').label).toBe('Closet')
    expect(currentPage(closet.pages, '/admin/closet/').label).toBe('Closet')
    expect(currentPage(closet.pages, '/admin/closet/today').label).toBe('Today')
    expect(currentPage(closet.pages, '/admin/closet/review').label).toBe(
      'Review',
    )
    expect(currentPage(closet.pages, '/admin/closet/add').label).toBe('Add')
    expect(closet.pages.map((page) => page.label)).toEqual([
      'Today',
      'Closet',
      'Add',
      'Review',
      'Profile',
    ])
    expect(closet.home).toBe('/admin/closet/today')
    expect(areaFor('/admin/closet/profile').key).toBe('closet')
  })

  it('is null off every page', () => {
    expect(currentPage(closet.pages, '/admin/spots')).toBeNull()
  })
})
