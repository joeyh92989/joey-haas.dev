/**
 * Writes public/search-index.json, the search palette's index, which Vite
 * then copies to dist/. Runs after fetch-snapshot.mjs and before
 * `vite build`.
 *
 * Inputs: the posts' frontmatter (drafts skipped, as generate-rss.mjs does),
 * and public/snapshot/items.json and comics.json when the snapshot step
 * wrote them. The snapshot holds public rows only, so nothing private can
 * reach the index. The static pages are not written: the palette has them
 * in its bundle (src/content/pages.js), so it can list them while the index
 * is still loading or missing. The one exception is /blog, which is listed
 * only while there are published posts.
 *
 * A missing or malformed optional input leaves its groups out and never
 * fails the build. The one failure is an index over BUDGET_BYTES gzipped,
 * so a shelf that outgrows the palette's design fails loudly.
 */
import matter from 'gray-matter'
import { realpathSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { BLOG_PAGE } from '../src/content/pages.js'
import { normalize } from '../src/lib/normalize.js'
import { pageEntry } from '../src/lib/searchIndex.js'
import { itemPath } from '../src/lib/spinePaths.js'

/** The palette's size budget, gzipped (search spec). */
export const BUDGET_BYTES = 100 * 1024

const joined = (...parts) =>
  normalize(
    parts
      .flat()
      .filter((part) => part != null && part !== '')
      .join(' '),
  )

const httpsCover = (url) =>
  typeof url === 'string' && url.startsWith('https://') ? url : undefined

/** "September 14, 2026", in UTC like content/posts.js's formatDate. */
function formatDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function postEntry(post) {
  const tags = Array.isArray(post.tags) ? post.tags.map(String) : []
  const keywords = Array.isArray(post.keywords) ? post.keywords.map(String) : []
  return {
    g: 'posts',
    t: normalize(post.title),
    s: joined(post.summary, tags, keywords),
    title: post.title,
    sub: [formatDate(post.date), tags[0]].filter(Boolean).join(' · '),
    href: `/blog/${post.slug}`,
  }
}

function itemEntry(item) {
  const platform = item.platform ?? item.platforms?.[0]
  return {
    g: 'shelf',
    t: normalize(item.title),
    s: joined(platform, item.platforms, item.year, item.status),
    title: item.title,
    sub: [platform, item.year].filter((part) => part != null).join(' · '),
    href: itemPath(item.id),
    cover: httpsCover(item.cover_url),
  }
}

function seriesEntry({ id, title, publisher, cover_url: cover }) {
  return {
    g: 'comics',
    t: normalize(title),
    s: joined(publisher),
    title,
    sub: publisher ?? '',
    href: itemPath(id),
    cover: httpsCover(cover),
  }
}

const hasTitle = (row) =>
  row !== null &&
  typeof row === 'object' &&
  typeof row.title === 'string' &&
  row.title.trim() !== ''

/**
 * The index's entries.
 *
 * @param {object} input
 * @param {object[]} input.posts Published posts' frontmatter plus `slug`.
 * @param {object[] | null} input.items The items snapshot, or null.
 * @param {{series: object[]} | null} input.comics The comics snapshot, or null.
 * @returns {object[]}
 */
export function buildIndex({ posts, items, comics }) {
  const entries = []
  const published = posts.filter(hasTitle)
  if (published.length > 0) entries.push(pageEntry(BLOG_PAGE))
  entries.push(...published.map(postEntry))
  const rows = Array.isArray(items)
    ? items.filter((item) => hasTitle(item) && item.id != null)
    : []
  entries.push(...rows.filter((item) => item.type !== 'comic').map(itemEntry))
  // A series is an item too, so the comics snapshot (with its publisher)
  // wins when present, and the comic items stand in for it otherwise.
  const series = Array.isArray(comics?.series)
    ? comics.series
        .filter((row) => hasTitle(row) && row.item_id != null)
        .map((row) => ({ ...row, id: row.item_id }))
    : rows
        .filter((item) => item.type === 'comic')
        .map((item) => ({ ...item, publisher: item.creator }))
  entries.push(...series.map(seriesEntry))
  return entries.map((entry) =>
    Object.fromEntries(
      Object.entries(entry).filter(([, value]) => value !== undefined),
    ),
  )
}

/** Published posts' frontmatter from a directory of markdown files. */
export async function readPosts(postsDir) {
  const names = (await fs.readdir(postsDir)).filter((name) =>
    name.endsWith('.md'),
  )
  const posts = []
  for (const name of names) {
    const { data } = matter(
      await fs.readFile(path.join(postsDir, name), 'utf8'),
    )
    if (data.draft === true) continue
    posts.push({
      ...data,
      slug: name.replace(/\.md$/, ''),
      title: String(data.title ?? ''),
      date:
        data.date instanceof Date
          ? data.date.toISOString().slice(0, 10)
          : String(data.date ?? ''),
    })
  }
  return posts
}

/** A snapshot file's body, or null when it is missing or unreadable. */
async function readOptionalJson(file, log) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') {
      log(`search index: ignoring ${path.basename(file)} (${error.message})`)
    }
    return null
  }
}

/**
 * Builds and writes the index.
 *
 * @returns {Promise<{count: number, bytes: number, gzipped: number}>}
 * @throws When the index is over BUDGET_BYTES gzipped.
 */
export async function writeSearchIndex({
  postsDir,
  snapshotDir,
  outFile,
  log = console.log,
}) {
  const items = await readOptionalJson(
    path.join(snapshotDir, 'items.json'),
    log,
  )
  const comics = await readOptionalJson(
    path.join(snapshotDir, 'comics.json'),
    log,
  )
  const entries = buildIndex({
    posts: await readPosts(postsDir),
    items: Array.isArray(items) ? items : null,
    comics: comics && typeof comics === 'object' ? comics : null,
  })
  const text = JSON.stringify({ entries })
  const bytes = Buffer.byteLength(text)
  const gzipped = gzipSync(text).length
  if (gzipped > BUDGET_BYTES) {
    throw new Error(
      `search index is ${gzipped} bytes gzipped, over the ${BUDGET_BYTES} budget`,
    )
  }
  const tmpFile = `${outFile}.tmp`
  await fs.writeFile(tmpFile, text)
  await fs.rename(tmpFile, outFile)
  log(
    `search index: ${entries.length} entries, ${bytes} bytes (${gzipped} gzipped)`,
  )
  return { count: entries.length, bytes, gzipped }
}

/** True when this file was started directly, through symlinks or not. */
function isEntryPoint() {
  try {
    return (
      realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
    )
  } catch {
    return false
  }
}

if (isEntryPoint()) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  await writeSearchIndex({
    postsDir: path.join(root, 'posts'),
    snapshotDir: path.join(root, 'public', 'snapshot'),
    outFile: path.join(root, 'public', 'search-index.json'),
  })
}
