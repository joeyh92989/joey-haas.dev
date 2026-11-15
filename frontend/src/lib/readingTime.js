const WORDS_PER_MINUTE = 220

/**
 * Minutes to read a markdown body: its words at 220 a minute, rounded up,
 * never under one. Fenced code is left out, since nobody reads it like prose.
 * Shared by the markdown plugin and `scripts/markdown-lib.mjs`.
 *
 * @param {string} markdown The body, without frontmatter.
 * @returns {number} Whole minutes, at least 1.
 */
export function readingMinutes(markdown) {
  const prose = markdown.replace(/^(```|~~~)[\s\S]*?^\1/gm, ' ')
  const count = prose.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(count / WORDS_PER_MINUTE))
}
