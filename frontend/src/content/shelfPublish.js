/**
 * The words of the Publish all confirm on the two admin shelves.
 *
 * @param {number} count  How many rows the action covers.
 * @param {string} noun  Singular ("game", "comic series").
 * @param {string} [plural]
 * @returns {string}
 */
export function publishAllDetail(count, noun, plural = `${noun}s`) {
  return `Publish ${count} ${count === 1 ? noun : plural} to My Shelf?`
}
