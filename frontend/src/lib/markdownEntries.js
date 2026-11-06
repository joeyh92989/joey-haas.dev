/**
 * Turns an eager `import.meta.glob` of compiled markdown into the published
 * entries, newest first. Shared by content/posts.js and content/notes.js.
 *
 * vite-plugin-markdown compiles each file to { slug, frontmatter, html }, and
 * a draft to null in production builds, so filtering nulls here is what keeps
 * unpublished content out of the shipped bundle, not merely off the page.
 * Dates are 'YYYY-MM-DD' strings, which sort correctly as text.
 *
 * @param {Record<string, {default: object | null}>} modules The glob result.
 * @returns {object[]} The entries, newest first.
 */
export function publishedEntries(modules) {
  return Object.values(modules)
    .map((module) => module.default)
    .filter(Boolean)
    .sort((a, b) => b.frontmatter.date.localeCompare(a.frontmatter.date))
}
