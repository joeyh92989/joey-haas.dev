import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readPublished, rssFeed, writeFeed } from './markdown-lib.mjs'

let root

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-lib-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

/** Writes a markdown file with frontmatter into a folder under root. */
async function write(folder, name, frontmatter, body = 'First paragraph.') {
  const dir = path.join(root, folder)
  await fs.mkdir(dir, { recursive: true })
  const yaml = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
  await fs.writeFile(path.join(dir, name), `---\n${yaml}\n---\n\n${body}\n`)
}

const FEED = {
  title: 'Feed & co',
  description: 'Things',
  link: 'https://joey-haas.dev',
  itemPrefix: '/til',
  selfPath: '/til/feed.xml',
}

describe('readPublished', () => {
  it('reads published entries newest first and skips drafts', async () => {
    await write('notes', 'older.md', { title: 'Older', date: '2026-10-01' })
    await write('notes', 'newer.md', { title: 'Newer', date: '2026-11-01' })
    await write('notes', 'hidden.md', {
      title: 'Hidden',
      date: '2026-12-01',
      draft: true,
    })
    const entries = await readPublished(path.join(root, 'notes'))
    expect(entries.map((entry) => entry.slug)).toEqual(['newer', 'older'])
    // An unquoted YAML date comes back as the same plain string.
    expect(entries[0].date).toBe('2026-11-01')
  })

  it('reads a missing folder as empty', async () => {
    expect(await readPublished(path.join(root, 'nowhere'))).toEqual([])
  })
})

describe('rssFeed', () => {
  it('links each item under its prefix and escapes the text', () => {
    const xml = rssFeed({
      ...FEED,
      entries: [
        {
          slug: 'a-note',
          title: 'Tom & <Jerry>',
          date: '2026-11-06',
          body: 'It "works".',
        },
      ],
    })
    expect(xml).toContain('<title>Feed &amp; co</title>')
    expect(xml).toContain('<title>Tom &amp; &lt;Jerry&gt;</title>')
    expect(xml).toContain(
      '<link>https://joey-haas.dev/til/a-note</link>\n      <guid isPermaLink="true">https://joey-haas.dev/til/a-note</guid>',
    )
    expect(xml).toContain(
      '<atom:link href="https://joey-haas.dev/til/feed.xml" rel="self"',
    )
    expect(xml).toContain('<pubDate>Fri, 06 Nov 2026 00:00:00 GMT</pubDate>')
  })

  it('writes a valid empty channel when there is nothing published', () => {
    const xml = rssFeed({ ...FEED, entries: [] })
    expect(xml).toContain('<channel>')
    expect(xml).not.toContain('<item>')
  })
})

describe('writeFeed', () => {
  it('writes one feed per folder from the same function', async () => {
    await write('posts', 'essay.md', { title: 'Essay', date: '2026-09-01' })
    await write('notes', 'quirk.md', { title: 'Quirk', date: '2026-11-06' })
    const blog = path.join(root, 'dist', 'feed.xml')
    const til = path.join(root, 'dist', 'til', 'feed.xml')

    await writeFeed({
      sourceDir: path.join(root, 'posts'),
      outFile: blog,
      feed: { ...FEED, itemPrefix: '/blog', selfPath: '/feed.xml' },
    })
    await writeFeed({
      sourceDir: path.join(root, 'notes'),
      outFile: til,
      feed: FEED,
    })

    const [blogXml, tilXml] = await Promise.all([
      fs.readFile(blog, 'utf8'),
      fs.readFile(til, 'utf8'),
    ])
    expect(blogXml).toContain('/blog/essay</link>')
    expect(blogXml).not.toContain('quirk')
    expect(tilXml).toContain('/til/quirk</link>')
    expect(tilXml).not.toContain('essay')
  })
})
