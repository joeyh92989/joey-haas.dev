/**
 * Generates dist/feed.xml from the markdown in frontend/posts/.
 *
 * Reads frontmatter only and never renders post HTML. A second markdown
 * pipeline would be a second thing to keep in sync with the first, and the two
 * would drift; reading only frontmatter means this script cannot disagree with
 * the site about how a post renders, because it never renders one.
 *
 * Runs after `vite build`, so dist/ already exists.
 */
import matter from 'gray-matter'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE_URL = 'https://joey-haas.dev'
const SITE_TITLE = 'Joey Haas'
const SITE_DESCRIPTION = 'Posts from joey-haas.dev'

const here = path.dirname(fileURLToPath(import.meta.url))
const postsDir = path.join(here, '..', 'posts')
const outFile = path.join(here, '..', 'dist', 'feed.xml')

/** Escapes the five XML predefined entities. */
function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Matches the plugin's normalization: a plain 'YYYY-MM-DD' string. */
function toDateString(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value)
}

const names = (await fs.readdir(postsDir)).filter((name) => name.endsWith('.md'))

const items = []
for (const name of names) {
  const raw = await fs.readFile(path.join(postsDir, name), 'utf8')
  const { data } = matter(raw)
  if (data.draft === true) continue
  items.push({
    slug: name.replace(/\.md$/, ''),
    title: String(data.title),
    date: toDateString(data.date),
  })
}

items.sort((a, b) => b.date.localeCompare(a.date))

const entries = items
  .map(
    (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${SITE_URL}/blog/${escapeXml(item.slug)}</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${escapeXml(item.slug)}</guid>
      <pubDate>${new Date(item.date).toUTCString()}</pubDate>
    </item>`,
  )
  .join('\n')

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_TITLE)}</title>
    <link>${SITE_URL}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>en-us</language>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
${entries}
  </channel>
</rss>
`

await fs.mkdir(path.dirname(outFile), { recursive: true })
await fs.writeFile(outFile, xml, 'utf8')
console.log(`feed.xml written with ${items.length} item(s)`)
