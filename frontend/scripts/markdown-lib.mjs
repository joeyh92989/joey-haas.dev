/**
 * Reads the site's markdown folders (frontend/posts/, frontend/notes/) for
 * the build scripts, and writes their RSS feeds.
 *
 * Frontmatter and the first paragraph's plain text only: post HTML is never
 * rendered here. A second markdown pipeline would be a second thing to keep
 * in step with vite-plugin-markdown, and the two would drift. Reading the
 * frontmatter means these scripts cannot disagree with the site about how a
 * post renders.
 *
 * One reader serves prerender.mjs and generate-rss.mjs, so the two agree on
 * what counts as published, and one feed writer serves both feeds.
 */
import matter from 'gray-matter'
import fs from 'node:fs/promises'
import path from 'node:path'
import { SITE_URL, excerpt } from './prerender-lib.mjs'

/**
 * Escapes the five XML predefined entities.
 *
 * @param {string} value Text for an XML element or attribute.
 * @returns {string} The escaped text.
 */
export function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Matches the plugin's normalization: a plain 'YYYY-MM-DD' string.
 * gray-matter reads an unquoted YAML date as a Date at UTC midnight.
 *
 * @param {unknown} value The frontmatter date.
 * @returns {string} The date as text.
 */
export function toDateString(value) {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value)
}

/**
 * Every published entry in a folder of markdown, newest first.
 *
 * Drafts are skipped, by the same rule as the plugin's production build. A
 * missing folder reads as empty, so a site with no notes yet still builds.
 *
 * @param {string} dir The folder to read.
 * @returns {Promise<{slug: string, title: string, date: string, body: string}[]>}
 */
export async function readPublished(dir) {
  let names
  try {
    names = await fs.readdir(dir)
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  const entries = []
  for (const name of names.filter((file) => file.endsWith('.md'))) {
    const { data, content } = matter(
      await fs.readFile(path.join(dir, name), 'utf8'),
    )
    if (data.draft === true) continue
    entries.push({
      slug: name.replace(/\.md$/, ''),
      title: String(data.title),
      date: toDateString(data.date),
      body: content,
      // The rest of the frontmatter, for a reader that needs more than the
      // four fields every kind of entry has (a trip's summary and cover).
      frontmatter: data,
    })
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * An RSS 2.0 channel for published entries.
 *
 * @param {object} feed
 * @param {{slug: string, title: string, date: string, body: string}[]} feed.entries
 *   Newest first.
 * @param {string} feed.title The channel title.
 * @param {string} feed.description The channel description.
 * @param {string} feed.link The channel's home page, an absolute URL.
 * @param {string} feed.itemPrefix The path an entry's slug is appended to,
 *   such as '/blog'.
 * @param {string} feed.selfPath The feed's own path, such as '/feed.xml'.
 * @returns {string} The feed document.
 */
export function rssFeed({
  entries,
  title,
  description,
  link,
  itemPrefix,
  selfPath,
}) {
  const items = entries
    .map((entry) => {
      const url = `${SITE_URL}${itemPrefix}/${escapeXml(entry.slug)}`
      // The first paragraph, as plain text: the same excerpt the page's
      // prerendered description uses.
      return `    <item>
      <title>${escapeXml(entry.title)}</title>
      <description>${escapeXml(excerpt(entry.body))}</description>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(entry.date).toUTCString()}</pubDate>
    </item>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${link}</link>
    <description>${escapeXml(description)}</description>
    <language>en-us</language>
    <atom:link href="${SITE_URL}${selfPath}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`
}

/**
 * Reads a markdown folder and writes its feed.
 *
 * @param {object} options
 * @param {string} options.sourceDir The markdown folder.
 * @param {string} options.outFile Where to write the feed.
 * @param {Omit<Parameters<typeof rssFeed>[0], 'entries'>} options.feed
 *   Everything rssFeed takes but the entries.
 * @returns {Promise<number>} How many entries the feed carries.
 */
export async function writeFeed({ sourceDir, outFile, feed }) {
  const entries = await readPublished(sourceDir)
  await fs.mkdir(path.dirname(outFile), { recursive: true })
  await fs.writeFile(outFile, rssFeed({ ...feed, entries }), 'utf8')
  return entries.length
}
