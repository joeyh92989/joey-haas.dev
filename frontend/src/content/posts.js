/**
 * Blog posts, compiled from markdown at build time.
 *
 * vite-plugin-markdown turns each file in frontend/posts/ into a module
 * exporting { slug, frontmatter, html }; publishedEntries drops drafts and
 * sorts newest first.
 */
import { publishedEntries } from '../lib/markdownEntries.js'

const modules = import.meta.glob('../../posts/*.md', { eager: true })

/** Every published post, newest first. */
export const posts = publishedEntries(modules)

/** Returns the post with this slug, or undefined if there is none. */
export function findPost(slug) {
  return posts.find((post) => post.slug === slug)
}
