/**
 * Tags on the shelf: the chip groups a list filters by, the filter itself,
 * and the labelled groups an item page draws. Words come from content/tags.js
 * by key; the API only ever sends keys from its vocabulary.
 */
import { tagGroupsOf } from '../content/tags.js'

/**
 * A chip that matches more than this share of a shelf narrows nothing, so
 * the Games page does not draw it (and a test holds the shelf to it).
 */
export const MAX_SHARE = 0.5

/** The stored tags of a row, tolerant of a row from before tags existed. */
export const tagsOf = (row) => (Array.isArray(row?.tags) ? row.tags : [])

/** Whether a row carries one tag. */
const has = (row, group, tag) =>
  tagsOf(row).some((entry) => entry.group === group && entry.tag === tag)

/** The selection with no tag chosen, one null per group of the type. */
export function noTags(type) {
  return Object.fromEntries(tagGroupsOf(type).map(({ key }) => [key, null]))
}

/**
 * FilterChips groups for a type's tags, counted over `rows`.
 *
 * @param {string} type - 'game' or 'comic'.
 * @param {object[]} rows - The rows the chips count (unfiltered).
 * @param {{maxShare?: number, selected?: Record<string, string|null|undefined>, limit?: Record<string, number>, moreLabel?: Record<string, string>}} [options]
 *   `maxShare` leaves out a chip that matches more than that share of the
 *   rows (none by default), except one in `selected` (the current choice),
 *   which always stays so the filter can be undone; `limit` caps a group's
 *   chips with a More… chip.
 */
export function tagChipGroups(type, rows, options = {}) {
  const { maxShare = null, selected = {}, limit = {}, moreLabel = {} } = options
  return tagGroupsOf(type).map((group) => {
    const counted = group.tags
      .map((tag) => ({
        value: tag.key,
        label: tag.label,
        count: rows.filter((row) => has(row, group.key, tag.key)).length,
      }))
      .filter(
        (option) =>
          maxShare === null ||
          option.count <= rows.length * maxShare ||
          selected[group.key] === option.value,
      )
      // The most common first, so a limit keeps the chips that narrow most.
      .sort((a, b) => b.count - a.count)
    return {
      key: group.key,
      label: group.label,
      options: counted,
      ...(limit[group.key] && { limit: limit[group.key] }),
      ...(moreLabel[group.key] && { moreLabel: moreLabel[group.key] }),
    }
  })
}

/**
 * The rows that carry every chosen tag (one per group, ANDed).
 *
 * @param {object[]} rows
 * @param {string} type
 * @param {Record<string, string|null|undefined>} selection - Keyed by group.
 */
export function filterByTags(rows, type, selection) {
  const chosen = tagGroupsOf(type).filter(({ key }) => selection[key])
  if (chosen.length === 0) return rows
  return rows.filter((row) =>
    chosen.every(({ key }) => has(row, key, selection[key])),
  )
}

/** Whether any group of the type has a tag chosen. */
export const hasTagFilter = (type, selection) =>
  tagGroupsOf(type).some(({ key }) => selection[key])

/**
 * A row's tags as labelled groups for the item page, in vocabulary order;
 * a group with none is left out.
 *
 * @returns {{key: string, label: string, tags: {key: string, label: string}[]}[]}
 */
export function itemTagGroups(row) {
  return tagGroupsOf(row.type)
    .map((group) => ({
      ...group,
      tags: group.tags.filter((tag) => has(row, group.key, tag.key)),
    }))
    .filter((group) => group.tags.length > 0)
}

/**
 * The picker's value after one tag is switched on or off, kept in the
 * vocabulary's order so it compares equal to what the API stores.
 *
 * @param {string} type
 * @param {{group: string, tag: string}[]} current
 * @param {string} group
 * @param {string} tag
 */
export function toggleTag(type, current, group, tag) {
  const on = current.some((entry) => entry.group === group && entry.tag === tag)
  const next = on
    ? current.filter((entry) => !(entry.group === group && entry.tag === tag))
    : [...current, { group, tag }]
  const order = tagGroupsOf(type).flatMap((g) =>
    g.tags.map((t) => `${g.key}/${t.key}`),
  )
  return next
    .slice()
    .sort(
      (a, b) =>
        order.indexOf(`${a.group}/${a.tag}`) -
        order.indexOf(`${b.group}/${b.tag}`),
    )
}
