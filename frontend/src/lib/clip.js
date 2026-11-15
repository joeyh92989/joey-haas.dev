/** Room for a meta description (a search engine's snippet); longer is cut at a sentence, clause or word. */
export const DESCRIPTION_LIMIT = 160

/** Shortest cut worth keeping when it ends a sentence or a clause. */
const MIN_SENTENCE = 60
const MIN_CLAUSE = 90

/**
 * Cuts text to fit, never mid-clause when it can help it: at the last
 * sentence end that leaves a real snippet, else the last clause break (comma,
 * semicolon, colon, dash) with an ellipsis, else the last word with one.
 */
export function clip(text, limit = DESCRIPTION_LIMIT) {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= limit) return flat
  const window = flat.slice(0, limit)
  // A sentence end is punctuation followed by a space (or the cut itself).
  let sentence = -1
  for (const match of window.matchAll(/[.!?]["”’)]?(?=\s|$)/g)) {
    const end = match.index + match[0].length
    if (flat[end] === undefined || /\s/.test(flat[end])) sentence = end
  }
  if (sentence >= MIN_SENTENCE) return window.slice(0, sentence)
  const clause = Math.max(
    window.lastIndexOf(', '),
    window.lastIndexOf('; '),
    window.lastIndexOf(': '),
    window.lastIndexOf(' – '),
    window.lastIndexOf(' — '),
  )
  if (clause >= MIN_CLAUSE) return `${window.slice(0, clause)}…`
  const cut = flat.slice(0, limit - 1)
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.]$/, '')}…`
}
