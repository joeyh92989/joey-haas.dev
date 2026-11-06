/**
 * Search normalization, the browser's copy of `normalize_title` in
 * backend/matching.py: case-folded, accent-folded (NFKD, combining marks
 * dropped, so "Pokémon" is "pokemon" and "²" is "2"), every run of
 * anything but letters and digits to one space, trimmed. Keep the two in
 * step; a query and an index entry only meet if both sides fold alike.
 * The one difference is the second lower-casing below.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalize(text) {
  return (
    String(text ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      // Again after NFKD: compatibility forms can decompose to capitals
      // ("™" is "TM"), which the backend keeps and search must not.
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  )
}
