/**
 * Blog posts, compiled from markdown at build time.
 *
 * vite-plugin-markdown turns each file in frontend/posts/ into a module
 * exporting { slug, frontmatter, html }. Drafts compile to null in production
 * builds, so filtering nulls here is what keeps unpublished content out of the
 * shipped bundle — not merely off the page.
 */
const modules = import.meta.glob('../../posts/*.md', { eager: true })

/**
 * Every published post, newest first.
 *
 * Dates are 'YYYY-MM-DD' strings, which sort correctly as text — no Date
 * objects and no timezone handling involved in ordering.
 */
export const posts = Object.values(modules)
  .map((module) => module.default)
  .filter(Boolean)
  .sort((a, b) => b.frontmatter.date.localeCompare(a.frontmatter.date))

/** Returns the post with this slug, or undefined if there is none. */
export function findPost(slug) {
  return posts.find((post) => post.slug === slug)
}
