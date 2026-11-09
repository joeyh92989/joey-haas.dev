/**
 * Trips, compiled from markdown at build time, the same way as posts and
 * TIL notes.
 *
 * Trips live in frontend/trips/, apart from frontend/posts/ and
 * frontend/notes/, so which kind a file is depends on its folder, not a
 * frontmatter flag. A trip's module is { slug, frontmatter, days, cover }
 * — days in place of a post's single html, since a trip's body is a grammar
 * (see frontend/scripts/trip-markdown.mjs).
 *
 * `frontmatter.date` is the trip's first day, which is what sorts them.
 */
import { findEntry, publishedEntries } from '../lib/markdownEntries.js'

const modules = import.meta.glob('../../trips/*.md', { eager: true })

/** Every published trip, newest first. */
export const trips = publishedEntries(modules)

/** Returns the trip with this slug, or undefined if there is none. */
export function findTrip(slug) {
  return findEntry(trips, slug)
}
