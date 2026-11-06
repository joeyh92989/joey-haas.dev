/**
 * TIL notes, compiled from markdown at build time, the same way as posts.
 *
 * Notes live in frontend/notes/, apart from frontend/posts/, so which kind
 * a file is depends on its folder, not a frontmatter flag, and no post
 * consumer needs a filter. A slug may repeat across the two folders.
 */
import { findEntry, publishedEntries } from '../lib/markdownEntries.js'

const modules = import.meta.glob('../../notes/*.md', { eager: true })

/** Every published note, newest first. */
export const notes = publishedEntries(modules)

/** Returns the note with this slug, or undefined if there is none. */
export function findNote(slug) {
  return findEntry(notes, slug)
}
