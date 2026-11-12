import fs from 'node:fs/promises'
import path from 'node:path'

import rehypeShiki from '@shikijs/rehype'
import matter from 'gray-matter'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

import {
  assertNoPlaceholders,
  dayDates,
  parseTripDays,
  parseTripFrontmatter,
} from './scripts/trip-markdown.mjs'

/**
 * Both palettes are compiled in one highlight pass. Shiki writes the light
 * theme as inline colors and the dark theme as `--shiki-dark*` custom
 * properties; index.css swaps them in under [data-theme='dark']. Highlighting
 * again at runtime would mean shipping the highlighter to the browser.
 */
/*
 * Picked on measured contrast against the --code-bg values they sit on, not on
 * looks. Every color either theme emits across fifteen sample languages clears
 * 4.5:1: worst 4.53 light (the red used for string escapes) and 4.89 dark (the
 * grey used for JSX and HTML angle brackets). The vitesse pair used before
 * failed six of nine tokens on light and three of nine on dark, even against
 * plain white and near-black.
 *
 * Changing either theme, or either --code-bg, means measuring again.
 */
const SHIKI_THEMES = { light: 'light-plus', dark: 'dark-plus' }

/** The visible text of a hast node. */
function textOf(node) {
  if (node.type === 'text') return node.value
  return (node.children ?? []).map(textOf).join('')
}

/** Lowercase letters, digits and hyphens. */
function slugify(text) {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
  return slug || 'section'
}

/**
 * Gives every h2 and h3 a stable id: its text, slugged, with -1, -2... on a
 * repeat within the same document. Stable means the same text always gives
 * the same id, so a shared link keeps working until the heading is renamed.
 * The h2s are left on `file.data.headings` as [{id, text}] for the contents
 * list; the markup is otherwise untouched, so the Shiki step is unaffected.
 *
 * A heading that already has an id (GFM's `footnote-label`) or is screen-reader
 * only keeps what it has: it is no part of the author's outline, so it gets no
 * new id and never enters the contents list. Its id is still taken, so a
 * later heading cannot collide with it.
 */
export function rehypeHeadingIds() {
  return (tree, file) => {
    const used = new Set()
    const headings = []
    const isHeading = (node) =>
      node.type === 'element' && /^h[23]$/.test(node.tagName)
    const isAuthored = (node) => {
      const { id, className } = node.properties ?? {}
      const classes = [].concat(className ?? [])
      return !id && !classes.includes('sr-only')
    }
    const collect = (node) => {
      if (isHeading(node) && node.properties?.id) {
        used.add(String(node.properties.id))
      }
      node.children?.forEach(collect)
    }
    const walk = (node) => {
      if (isHeading(node) && isAuthored(node)) {
        const text = textOf(node)
        const base = slugify(text)
        let id = base
        for (let n = 1; used.has(id); n += 1) id = `${base}-${n}`
        used.add(id)
        node.properties = { ...node.properties, id }
        if (node.tagName === 'h2') headings.push({ id, text })
      }
      node.children?.forEach(walk)
    }
    collect(tree)
    walk(tree)
    file.data.headings = headings
  }
}

/** The parse and highlight chain both pipelines share; `ids` adds heading ids. */
function pipeline({ ids = false } = {}) {
  const chain = unified().use(remarkParse).use(remarkGfm).use(remarkRehype)
  if (ids) chain.use(rehypeHeadingIds)
  return chain
    .use(rehypeShiki, { themes: SHIKI_THEMES, defaultColor: 'light' })
    .use(rehypeStringify)
}

const processor = pipeline()

/** The post pipeline: the same, plus heading ids. Trips keep their own markup. */
const entryProcessor = pipeline({ ids: true })

/** Compiles a post or note body to { html, headings }. */
export async function compileEntry(content) {
  const file = await entryProcessor.process(content)
  return { html: String(file), headings: file.data.headings }
}

/**
 * A slug becomes part of a URL and of the RSS feed's XML. Restricting it to
 * lowercase letters, digits, and hyphens keeps both safe by construction rather
 * than by escaping after the fact — a filename like `q&a.md` would otherwise
 * produce a valid-but-ugly URL and, unescaped, a feed no reader can parse.
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Which collection a file belongs to is its folder, not a frontmatter flag. */
const TRIPS_DIR = /\/trips\/[^/]+\.md$/

/**
 * Normalizes a frontmatter date to a plain 'YYYY-MM-DD' string.
 *
 * gray-matter parses an unquoted YAML date into a Date at UTC midnight. Storing
 * a plain string avoids timezone arithmetic entirely: the strings sort correctly
 * with localeCompare, and rendering them with timeZone 'UTC' avoids the
 * off-by-one day that local formatting produces west of Greenwich.
 */
function toDateString(value, slug, ctx) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const text = String(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    ctx.error(`${slug}.md has an invalid date "${text}" — expected YYYY-MM-DD`)
  }
  return text
}

/**
 * A trip's photo manifest, or null when the images have not been built yet.
 *
 * `frontend/trips/<slug>/photos/photos.json` is written by
 * `scripts/build-travel-images.mjs`. Before a first run there is no
 * manifest, so the grammar's manifest checks are skipped rather than
 * failing a dev server on photos that do not exist yet; the image build
 * refuses a kid photo without an opt-in on its own.
 */
async function readPhotoManifest(id) {
  const dir = path.join(path.dirname(id), path.basename(id, '.md'), 'photos')
  try {
    const text = await fs.readFile(path.join(dir, 'photos.json'), 'utf8')
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Compiles a trip file: frontmatter, then one `##` heading per day.
 *
 * Trips are a third collection beside posts and TIL notes, told apart by
 * their folder as those two are. Their body is a grammar rather than free
 * markdown — days, places and photo lines — so it goes through
 * `scripts/trip-markdown.mjs`, which is also what the build scripts and the
 * grammar's tests use. Each day's prose then takes the same GFM and
 * two-palette Shiki pass as a post, so a trip can carry a code block
 * without a second highlighter.
 *
 * The module exports { slug, frontmatter, days, cover }: `days[].html` in
 * place of a post's single `html`, `days[].dates` ({from, to} or null), and
 * `cover` as {name, width, height} or null.
 */
async function compileTrip({ data, content, slug, id }) {
  const manifest = await readPhotoManifest(id)
  const photos = Object.fromEntries(
    (manifest ?? []).map((photo) => [photo.name, photo]),
  )
  const photoNames = manifest ? manifest.map((photo) => photo.name) : undefined

  const frontmatter = parseTripFrontmatter(data, slug, photoNames, photos)
  const days = parseTripDays(content, {
    slug,
    places: frontmatter.places,
    date: frontmatter.date,
    end: frontmatter.end,
    photoNames,
    photos,
  })

  const compiled = []
  for (const day of days) {
    const { markdown: prose, ...rest } = day
    compiled.push({
      ...rest,
      html: String(await processor.process(prose)),
      // Derived here, not in the browser, so the page never re-implements
      // the date arithmetic; null below day precision (D12).
      dates: dayDates(day, frontmatter),
      // The built widths travel with the day so the page can reserve the
      // photo's space without importing the manifest itself.
      photos: day.photos.map((photo) => ({
        ...photo,
        width: photos[photo.name]?.width ?? null,
        height: photos[photo.name]?.height ?? null,
      })),
    })
  }

  // The cover need not appear in any day, so its size is looked up here
  // rather than found among the days' photos.
  const cover = frontmatter.cover
    ? {
        name: frontmatter.cover,
        width: photos[frontmatter.cover]?.width ?? null,
        height: photos[frontmatter.cover]?.height ?? null,
      }
    : null

  return { slug, frontmatter, days: compiled, cover }
}

/**
 * Compiles markdown posts, TIL notes and trips to JS modules at build time.
 *
 * A post or a note becomes a module exporting { slug, frontmatter, html, headings };
 * a trip, under frontend/trips/, exports { slug, frontmatter, days }. Parsing
 * and syntax highlighting both happen here, so the browser downloads neither a
 * markdown parser nor a highlighter.
 *
 * In a production build, a file with `draft: true` compiles to
 * `export default null` — its content never enters the module graph. Filtering
 * drafts in a component would leave the text sitting in the shipped bundle.
 */
export default function markdown() {
  let isProduction = false

  return {
    name: 'vite-plugin-markdown',
    enforce: 'pre',

    configResolved(config) {
      isProduction = config.command === 'build'
    },

    async transform(code, id) {
      if (!id.endsWith('.md')) return null

      const { data, content } = matter(code)
      const slug = id.split('/').pop().replace(/\.md$/, '')

      // A trip's frontmatter and body are a different grammar; the draft
      // rule and the slug check below are shared.
      if (TRIPS_DIR.test(id)) {
        if (!SLUG_PATTERN.test(slug)) {
          this.error(
            `"${slug}.md" is not a usable slug. Filenames must be lowercase ` +
              'letters, digits, and single hyphens.',
          )
        }
        if (data.draft === true && isProduction) {
          return { code: 'export default null', map: null }
        }
        try {
          assertNoPlaceholders(code, slug, data.draft === true)
          const trip = await compileTrip({ data, content, slug, id })
          return { code: `export default ${JSON.stringify(trip)}`, map: null }
        } catch (error) {
          this.error(error.message)
        }
      }

      if (!SLUG_PATTERN.test(slug)) {
        this.error(
          `"${slug}.md" is not a usable slug. Filenames must be lowercase ` +
            'letters, digits, and single hyphens — for example ' +
            '"dependency-injection.md".',
        )
      }

      if (!data.title) {
        this.error(`${slug}.md is missing required frontmatter field: title`)
      }
      if (!data.date) {
        this.error(`${slug}.md is missing required frontmatter field: date`)
      }

      const draft = data.draft === true
      if (draft && isProduction) {
        return { code: 'export default null', map: null }
      }

      const { html, headings } = await compileEntry(content)
      const frontmatter = {
        title: String(data.title),
        date: toDateString(data.date, slug, this),
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        draft,
        // Optional: a line or two for the blog index and Home's card.
        ...(data.summary ? { summary: String(data.summary) } : {}),
      }

      return {
        code: `export default ${JSON.stringify({ slug, frontmatter, html, headings })}`,
        map: null,
      }
    },
  }
}
