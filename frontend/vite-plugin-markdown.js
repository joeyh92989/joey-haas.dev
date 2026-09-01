import rehypeShiki from '@shikijs/rehype'
import matter from 'gray-matter'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

/**
 * Both palettes are compiled in one highlight pass. Shiki writes the light
 * theme as inline colors and the dark theme as `--shiki-dark*` custom
 * properties; index.css swaps them in under [data-theme='dark']. Highlighting
 * again at runtime would mean shipping the highlighter to the browser.
 */
const SHIKI_THEMES = { light: 'vitesse-light', dark: 'vitesse-dark' }

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeShiki, { themes: SHIKI_THEMES, defaultColor: 'light' })
  .use(rehypeStringify)

/**
 * A slug becomes part of a URL and of the RSS feed's XML. Restricting it to
 * lowercase letters, digits, and hyphens keeps both safe by construction rather
 * than by escaping after the fact — a filename like `q&a.md` would otherwise
 * produce a valid-but-ugly URL and, unescaped, a feed no reader can parse.
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

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
 * Compiles markdown posts to JS modules at build time.
 *
 * Each .md file becomes a module exporting { slug, frontmatter, html }. Parsing
 * and syntax highlighting both happen here, so the browser downloads neither a
 * markdown parser nor a highlighter.
 *
 * In a production build, a post with `draft: true` compiles to
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

      if (!SLUG_PATTERN.test(slug)) {
        this.error(
          `"${slug}.md" is not a usable slug. Post filenames must be lowercase ` +
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

      const html = String(await processor.process(content))
      const frontmatter = {
        title: String(data.title),
        date: toDateString(data.date, slug, this),
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        draft,
      }

      return {
        code: `export default ${JSON.stringify({ slug, frontmatter, html })}`,
        map: null,
      }
    },
  }
}
