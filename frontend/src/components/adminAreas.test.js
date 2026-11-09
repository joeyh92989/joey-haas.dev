import { describe, expect, it } from 'vitest'
import {
  ADMIN_AREAS,
  areaFor,
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
      expect(homes.map((area) => area.key), path).toHaveLength(1)
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
      expect(owned(area).map((page) => page.to), area.key).toContain(area.home)
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

describe('areaFor', () => {
  it.each([
    ['/admin', 'home', 'Home'],
    ['/admin/', 'home', 'Home'],
    ['/admin/jobs', 'home', 'Jobs'],
    ['/admin/collection', 'shelf', 'Collection'],
    ['/admin/collection/42', 'shelf', 'Collection'],
    ['/admin/import', 'shelf', 'Import photos'],
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
