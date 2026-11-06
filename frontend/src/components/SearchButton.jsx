/**
 * The masthead's Search button, with the keyboard shortcut as a hint
 * (⌘K on a Mac, Ctrl K elsewhere). The hint is hidden on a phone by CSS,
 * where there is no keyboard to press it on; it is aria-hidden throughout,
 * since `aria-keyshortcuts` already tells assistive tech.
 *
 * @param {object} props
 * @param {() => void} props.onOpen Opens the search dialog.
 * @param {boolean} props.open Whether it is open, for `aria-expanded`.
 */
export default function SearchButton({ onOpen, open }) {
  return (
    <button
      type="button"
      className="btn sm mast-search"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-keyshortcuts={isMac() ? 'Meta+K /' : 'Control+K /'}
      onClick={onOpen}
    >
      Search
      <kbd className="search-kbd" aria-hidden="true">
        {isMac() ? '⌘K' : 'Ctrl K'}
      </kbd>
    </button>
  )
}

function isMac() {
  if (typeof navigator === 'undefined') return false
  const platform = navigator.userAgentData?.platform ?? navigator.platform ?? ''
  return /mac|iphone|ipad/i.test(platform)
}
