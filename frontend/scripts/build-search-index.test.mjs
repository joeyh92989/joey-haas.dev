// @vitest-environment node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BUDGET_BYTES,
  buildIndex,
  tripDayTitles,
  writeSearchIndex,
} from './build-search-index.mjs'

const post = {
  slug: 'how-spine-works',
  title: 'How My Shelf works',
  date: '2026-10-02',
  summary: 'The engineering behind My Shelf.',
  tags: ['shelf', 'engineering'],
  keywords: ['Game-Key Card'],
}
const game = {
  id: 'a1',
  type: 'game',
  title: 'Hades II',
  platform: 'Nintendo Switch 2',
  platforms: ['Nintendo Switch 2'],
  year: 2025,
  status: 'active',
  cover_url: 'https://images.igdb.com/hades.jpg',
}
const comicItem = {
  id: 'c1',
  type: 'comic',
  title: 'Saga',
  creator: 'Image',
  cover_url: 'https://comicvine.gamespot.com/saga.jpg',
}
const comics = {
  series: [
    {
      item_id: 'c1',
      title: 'Saga',
      publisher: 'Image Comics',
      cover_url: 'http://insecure.example/saga.jpg',
    },
  ],
}

describe('buildIndex', () => {
  it('holds the blog page and posts only without a snapshot', () => {
    const entries = buildIndex({ posts: [post], items: null, comics: null })
    expect(entries.map((e) => [e.g, e.href])).toEqual([
      ['pages', '/blog'],
      ['posts', '/blog/how-spine-works'],
    ])
  })

  it('leaves the blog page out when nothing is published', () => {
    expect(buildIndex({ posts: [], items: null, comics: null })).toEqual([])
  })

  it('lists notes under /til, with the TIL page, only when one is published', () => {
    const note = {
      slug: 'render-rewrites',
      title: 'Render rewrites need the slash',
      date: '2026-11-05',
      tags: ['render'],
      keywords: ['catch-all'],
    }
    const entries = buildIndex({
      posts: [],
      notes: [note],
      items: null,
      comics: null,
    })
    expect(entries.map((e) => [e.g, e.href])).toEqual([
      ['pages', '/til'],
      ['notes', '/til/render-rewrites'],
    ])
    expect(entries[1].sub).toBe('November 5, 2026 · render')
    expect(entries[1].s).toContain('catch all')
    expect(
      buildIndex({ posts: [], notes: [], items: null, comics: null }),
    ).toEqual([])
  })

  it('lists trips under /travel, with the Travel page, only when one is published', () => {
    const trip = {
      slug: 'ireland-2014',
      title: 'Ireland',
      date: '2014-06-01',
      precision: 'month',
      summary: 'Two weeks, mostly rain.',
      places: [{ name: 'Dublin' }, { name: 'Galway' }],
      dayTitles: ['The Burren'],
    }
    const entries = buildIndex({
      posts: [],
      trips: [trip],
      items: null,
      comics: null,
    })
    expect(entries.map((e) => [e.g, e.href])).toEqual([
      ['pages', '/travel'],
      ['trips', '/travel/ireland-2014'],
    ])
    expect(entries[1].sub).toBe('June 2014 · Dublin, Galway')
    expect(entries[1].s).toContain('galway')
    expect(entries[1].s).toContain('burren')
    expect(
      buildIndex({ posts: [], trips: [], items: null, comics: null }),
    ).toEqual([])
  })

  it('reads the title of each day heading', () => {
    expect(
      tripDayTitles(
        '## Day 1 · Arrive · Dubrovnik\n\nText.\n\n## Day 4–5 · Travel day · Dubrovnik → Naxos\n',
      ),
    ).toEqual(['Arrive', 'Travel day'])
  })

  it('puts summary, tags and keywords in the secondary text', () => {
    const [, entry] = buildIndex({ posts: [post], items: null, comics: null })
    expect(entry.s).toContain('game key card')
    expect(entry.s).toContain('engineering')
    expect(entry.sub).toBe('October 2, 2026 · shelf')
  })

  it('writes shelf rows with the item path and https covers only', () => {
    const entries = buildIndex({
      posts: [],
      items: [game, { ...game, id: 'a2', cover_url: 'http://x/y.jpg' }],
      comics: null,
    })
    expect(entries[0]).toMatchObject({
      g: 'shelf',
      t: 'hades ii',
      title: 'Hades II',
      sub: 'Nintendo Switch 2 · 2025',
      href: '/shelf/a1/',
      cover: 'https://images.igdb.com/hades.jpg',
    })
    expect(entries[1]).not.toHaveProperty('cover')
  })

  it('takes comics from the comics snapshot when present, never twice', () => {
    const entries = buildIndex({ posts: [], items: [game, comicItem], comics })
    const series = entries.filter((e) => e.g === 'comics')
    expect(series).toHaveLength(1)
    expect(series[0]).toMatchObject({ sub: 'Image Comics', href: '/shelf/c1/' })
    expect(series[0]).not.toHaveProperty('cover')
    expect(entries.filter((e) => e.g === 'shelf')).toHaveLength(1)
  })

  it('falls back to the comic items without a comics snapshot', () => {
    const entries = buildIndex({
      posts: [],
      items: [comicItem],
      comics: null,
    })
    expect(entries).toEqual([
      expect.objectContaining({
        g: 'comics',
        sub: 'Image',
        href: '/shelf/c1/',
      }),
    ])
  })

  it('drops rows with no id or title', () => {
    const entries = buildIndex({
      posts: [],
      items: [{ ...game, id: null }, { ...game, title: '' }, null],
      comics: { series: [{ title: 'No id' }] },
    })
    expect(entries).toEqual([])
  })
})

describe('writeSearchIndex', () => {
  let dir
  let log

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'search-index-'))
    await fs.mkdir(path.join(dir, 'posts'))
    await fs.mkdir(path.join(dir, 'snapshot'))
    await fs.writeFile(
      path.join(dir, 'posts', 'live.md'),
      '---\ntitle: Live post\ndate: 2026-10-02\ntags: [x]\n---\nBody.\n',
    )
    await fs.writeFile(
      path.join(dir, 'posts', 'draft.md'),
      '---\ntitle: Draft post\ndate: 2026-10-03\ndraft: true\n---\nBody.\n',
    )
    log = vi.fn()
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  const run = (notesDir = path.join(dir, 'notes')) =>
    writeSearchIndex({
      postsDir: path.join(dir, 'posts'),
      notesDir,
      snapshotDir: path.join(dir, 'snapshot'),
      outFile: path.join(dir, 'search-index.json'),
      log,
    })
  const written = async () =>
    JSON.parse(await fs.readFile(path.join(dir, 'search-index.json'), 'utf8'))

  it('writes pages and posts only without a snapshot, drafts skipped', async () => {
    await run()
    const { entries } = await written()
    expect(entries.map((e) => e.title)).toEqual(['Blog', 'Live post'])
  })

  it('reads published notes, drafts skipped', async () => {
    await fs.mkdir(path.join(dir, 'notes'))
    await fs.writeFile(
      path.join(dir, 'notes', 'one.md'),
      '---\ntitle: A note\ndate: 2026-11-05\n---\nBody.\n',
    )
    await fs.writeFile(
      path.join(dir, 'notes', 'two.md'),
      '---\ntitle: Draft note\ndate: 2026-11-06\ndraft: true\n---\nBody.\n',
    )
    await run()
    const { entries } = await written()
    expect(entries.map((e) => e.href)).toEqual([
      '/blog',
      '/blog/live',
      '/til',
      '/til/one',
    ])
  })

  it('reads the snapshot when present', async () => {
    await fs.writeFile(
      path.join(dir, 'snapshot', 'items.json'),
      JSON.stringify([game]),
    )
    const { count } = await run()
    expect(count).toBe(3)
    expect((await written()).entries.at(-1).title).toBe('Hades II')
  })

  it('leaves a malformed snapshot out and says so', async () => {
    await fs.writeFile(path.join(dir, 'snapshot', 'items.json'), '{nope')
    await fs.writeFile(path.join(dir, 'snapshot', 'comics.json'), '[]')
    await run()
    expect((await written()).entries).toHaveLength(2)
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('ignoring items.json'),
    )
  })

  it('refuses an index over the gzipped budget', async () => {
    // Random titles, so gzip cannot fold them away.
    const items = Array.from({ length: 6000 }, (_, i) => ({
      ...game,
      id: `id${i}`,
      title: `${Math.random().toString(36)}${Math.random().toString(36)}`,
    }))
    await fs.writeFile(
      path.join(dir, 'snapshot', 'items.json'),
      JSON.stringify(items),
    )
    await expect(run()).rejects.toThrow(`over the ${BUDGET_BYTES} budget`)
    await expect(
      fs.access(path.join(dir, 'search-index.json')),
    ).rejects.toThrow()
  })
})
