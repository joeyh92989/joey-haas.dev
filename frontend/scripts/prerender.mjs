/**
 * Writes a copy of dist/index.html for every public route, each with its own
 * title, description, canonical URL and link-preview tags, plus
 * sitemap.xml and robots.txt.
 *
 * Crawlers and link previewers mostly do not run JavaScript, so without this
 * every URL on the site previews as "Joey Haas". Only the head changes; the
 * body is the same SPA shell, and the app renders the page as before.
 *
 * Render serves dist/blog/<slug>/index.html at /blog/<slug>/ only: without
 * the slash the SPA catch-all wins. render.yaml therefore rewrites each
 * prerendered path to its file ahead of the catch-all, and a new page or
 * post needs its rule there too (prerender-lib.test.mjs checks). Item and
 * year pages are not rewritten: a rule whose file is missing serves an
 * empty page. Spine items come from the build-time snapshot, which
 * holds public items only; without a snapshot, items are simply skipped.
 *
 * Runs after `vite build`, so dist/ already exists.
 */
import matter from 'gray-matter'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ADMIN_ROUTES,
  noindex,
  publicRoutes,
  renderHead,
  robots,
  sitemap,
  spineFeed,
} from './prerender-lib.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(here, '..', 'dist')
const postsDir = path.join(here, '..', 'posts')

/** Published posts, by the same rule as generate-rss.mjs and the plugin. */
async function readPosts() {
  const names = (await fs.readdir(postsDir)).filter((name) =>
    name.endsWith('.md'),
  )
  const posts = []
  for (const name of names) {
    const { data, content } = matter(
      await fs.readFile(path.join(postsDir, name), 'utf8'),
    )
    if (data.draft === true) continue
    posts.push({
      slug: name.replace(/\.md$/, ''),
      title: String(data.title),
      date:
        data.date instanceof Date
          ? data.date.toISOString().slice(0, 10)
          : String(data.date),
      body: content,
    })
  }
  return posts
}

/** The snapshot's items, or none when this build has no snapshot. */
async function readItems() {
  try {
    const body = JSON.parse(
      await fs.readFile(path.join(dist, 'snapshot', 'items.json'), 'utf8'),
    )
    return Array.isArray(body) ? body : []
  } catch (error) {
    // No snapshot is normal (CI, local builds); a broken one is worth a line.
    if (error.code !== 'ENOENT') {
      console.warn(`prerender: snapshot unreadable, no item pages: ${error}`)
    }
    return []
  }
}

async function write(route, html) {
  const file =
    route === '/'
      ? path.join(dist, 'index.html')
      : path.join(dist, ...route.split('/').filter(Boolean), 'index.html')
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, html, 'utf8')
}

const shell = await fs.readFile(path.join(dist, 'index.html'), 'utf8')
const items = await readItems()
const routes = publicRoutes({ posts: await readPosts(), items })

for (const route of routes) {
  // The home page's file is also the SPA fallback for every other path, so
  // its head is the site-wide one plus the home title; no canonical there,
  // or every unknown path would claim to be the home page.
  const html =
    route.path === '/'
      ? renderHead(shell, route).replace(
          /\s*<link rel="canonical"[^>]*>|\s*<meta property="og:url"[^>]*>/g,
          '',
        )
      : renderHead(shell, route)
  await write(route.path, html)
}
for (const route of ADMIN_ROUTES) await write(route, noindex(shell))
await fs.writeFile(path.join(dist, 'sitemap.xml'), sitemap(routes), 'utf8')
await fs.writeFile(path.join(dist, 'robots.txt'), robots(), 'utf8')
await fs.writeFile(
  path.join(dist, 'spine', 'feed.xml'),
  spineFeed(items),
  'utf8',
)
console.log(`prerendered ${routes.length} route(s), sitemap.xml and robots.txt`)
