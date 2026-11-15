/**
 * Writes the two markdown feeds: dist/feed.xml from frontend/posts/ and
 * dist/til/feed.xml from frontend/notes/. Both go through writeFeed in
 * markdown-lib.mjs, so they cannot drift apart in escaping or excerpting.
 *
 * Runs after `vite build`, so dist/ already exists.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFeed } from './markdown-lib.mjs'
import { parseChangelog } from '../src/lib/changelog.js'
import { SITE_URL, changelogFeed } from './prerender-lib.mjs'

const frontend = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(frontend, 'dist')

const FEEDS = [
  {
    sourceDir: path.join(frontend, 'posts'),
    outFile: path.join(dist, 'feed.xml'),
    feed: {
      title: 'Joey Haas',
      description: 'Posts from joey-haas.dev',
      link: SITE_URL,
      itemPrefix: '/blog',
      selfPath: '/feed.xml',
    },
  },
  {
    sourceDir: path.join(frontend, 'notes'),
    outFile: path.join(dist, 'til', 'feed.xml'),
    feed: {
      title: 'TIL · Joey Haas',
      description: 'Short notes from joey-haas.dev',
      link: `${SITE_URL}/til`,
      itemPrefix: '/til',
      selfPath: '/til/feed.xml',
    },
  },
]

for (const options of FEEDS) {
  const count = await writeFeed(options)
  console.log(
    `${path.relative(dist, options.outFile)} written with ${count} item(s)`,
  )
}

// /blog/feed.xml is the blog feed's address by the pattern /til/feed.xml
// sets; readers that guess it should not land on the SPA shell.
await fs.mkdir(path.join(dist, 'blog'), { recursive: true })
await fs.copyFile(
  path.join(dist, 'feed.xml'),
  path.join(dist, 'blog', 'feed.xml'),
)
console.log('blog/feed.xml written (a copy of feed.xml)')

const changes = parseChangelog(
  await fs.readFile(path.join(frontend, 'changelog.md'), 'utf8'),
)
await fs.writeFile(
  path.join(dist, 'changelog.xml'),
  changelogFeed(changes),
  'utf8',
)
console.log(
  `changelog.xml written with ${Math.min(changes.length, 20)} item(s)`,
)
