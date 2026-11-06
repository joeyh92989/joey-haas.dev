/**
 * Whether a keydown opens the site search: ⌘K or Ctrl+K anywhere, and `/`
 * with no modifier only when focus is not somewhere that types, so a slash
 * typed into the shelf's search box stays a slash.
 *
 * @param {KeyboardEvent} event
 * @param {Element | null} activeElement Where focus is.
 * @returns {boolean}
 */
export function isSearchShortcut(event, activeElement) {
  if (event.isComposing || event.repeat) return false
  const key = event.key?.toLowerCase()
  if (key === 'k') {
    return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey
  }
  if (event.key !== '/') return false
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  return !isTypingTarget(activeElement)
}

function isTypingTarget(element) {
  if (!element) return false
  if (element.isContentEditable) return true
  const tag = element.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
