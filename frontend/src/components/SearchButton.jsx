import { mastButton } from './ui/button-variants.js'

/**
 * The masthead's Search button, with the keyboard shortcut as a hint
 * (⌘K on a Mac, Ctrl K elsewhere). The hint is hidden on a phone,
 * where there is no keyboard to press it on; it is aria-hidden throughout,
 * since `aria-keyshortcuts` already tells assistive tech.
 *
 * @param {object} props
 * @param {() => void} props.onOpen Opens the search dialog.
 * @param {() => void} [props.onPreload] Called on pointer or focus, to fetch
 *   the dialog's code before the press.
 * @param {boolean} props.open Whether it is open, for `aria-expanded`.
 */
export default function SearchButton({ onOpen, onPreload, open }) {
  return (
    <button
      type="button"
      className={mastButton()}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-keyshortcuts={isMac() ? 'Meta+K /' : 'Control+K /'}
      onPointerEnter={onPreload}
      onFocus={onPreload}
      onClick={onOpen}
    >
      Search
      <kbd
        className="rounded-[4px] border border-(--line-strong) px-1 py-[2px] font-sans text-[0.75rem] leading-none text-(--text-3) max-[640px]:hidden"
        aria-hidden="true"
      >
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
