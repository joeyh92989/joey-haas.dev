/**
 * Catalogue numbers for a collection's cards (the "No." label on a record card).
 *
 * The number is the row's place in the whole shelf, oldest first, so it does
 * not change when a filter, search or sort narrows or reorders the list.
 * Rows with a `created_at` come first in that order; a row without one (a
 * build snapshot written before the field) follows, and ties break by id, so
 * the result never depends on the order the rows arrive in.
 *
 * @param {object[]} rows The whole shelf of one type, unfiltered.
 * @param {(row: object) => string} [idOf] How a row's id is read.
 * @returns {Map<string, number>} id to number, from 1.
 */
export function catalogueNumbers(rows, idOf = (row) => row.id) {
  const ordered = [...rows].sort((left, right) => {
    const a = left.created_at ?? null
    const b = right.created_at ?? null
    if (a !== b) {
      if (a === null) return 1
      if (b === null) return -1
      return a < b ? -1 : 1
    }
    const idA = String(idOf(left))
    const idB = String(idOf(right))
    return idA < idB ? -1 : idA > idB ? 1 : 0
  })
  return new Map(ordered.map((row, index) => [idOf(row), index + 1]))
}
