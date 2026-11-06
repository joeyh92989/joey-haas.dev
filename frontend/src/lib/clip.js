/** Room for a search result snippet; longer is cut at a word. */
export const DESCRIPTION_LIMIT = 160

/** Cuts text at the last word that fits, with an ellipsis when cut. */
export function clip(text, limit = DESCRIPTION_LIMIT) {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= limit) return flat
  const cut = flat.slice(0, limit - 1)
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.]$/, '')}…`
}
