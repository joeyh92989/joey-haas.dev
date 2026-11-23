import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { profile } from '../content/profile.js'
import { mastButton } from './ui/button-variants.js'
import MastNavLink from './MastNavLink.jsx'
import MoreMenu from './MoreMenu.jsx'
import MobileNavSheet from './MobileNavSheet.jsx'
import SearchButton from './SearchButton.jsx'

/**
 * The site's one masthead, the same on every public route: monogram and
 * name, the nav as text links with the current one underlined, and on the
 * right the résumé download and the theme toggle.
 *
 * On a phone the CSS hides the nav and the résumé link and shows Menu,
 * which opens the same links as a sheet. Both are always rendered and CSS
 * picks one, so the first paint is right before any script measures the
 * viewport.
 *
 * @param {object} props
 * @param {'dark' | 'light'} props.theme The current theme.
 * @param {() => void} props.onToggleTheme Flips the theme.
 * @param {{to: string, label: string, end?: boolean}[]} props.items The nav.
 * @param {object[]} [props.more] The pages under More (`moreItems()`);
 *   shown in the desktop panel and the phone sheet's More group.
 * @param {() => void} [props.onOpenSearch] Opens the site search.
 * @param {() => void} [props.onPreloadSearch] Fetches the search code early
 *   (pointer or focus on the Search button).
 * @param {boolean} [props.searchOpen] Whether the site search is open.
 */
export default function SiteMast({
  theme,
  onToggleTheme,
  items,
  more = [],
  onOpenSearch,
  onPreloadSearch,
  searchOpen = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const target = theme === 'dark' ? 'light' : 'dark'

  return (
    <header className="mast relative z-2 border-b border-b-border bg-background">
      <div className="wrap mast-row flex h-[60px] items-center gap-6 max-[700px]:h-[54px] max-[700px]:gap-3 max-[384px]:gap-2">
        <Link
          to="/"
          className="brand flex flex-none items-center gap-3 font-bold text-foreground hover:no-underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring max-[700px]:min-h-11 max-[384px]:gap-2"
        >
          {/* Mono 500: the 600 cut of JetBrains Mono is not loaded (main.jsx). */}
          <span
            className="grid size-8 place-items-center rounded-[4px] border border-foreground bg-transparent font-mono text-[0.75rem] leading-[normal] font-medium text-foreground"
            aria-hidden="true"
          >
            JH
          </span>
          {profile.name}
        </Link>
        {/* The links are the full height of the bar (self-stretch). */}
        <nav
          className="site-nav ml-2 flex self-stretch gap-6 text-[0.875rem] max-[960px]:hidden"
          aria-label="Site"
        >
          {items.map((item) => (
            <MastNavLink key={item.to} item={item} variant="bar" />
          ))}
          {more.length > 0 && <MoreMenu items={more} />}
        </nav>
        {/* Outside <nav>: the toggle is a control, not a destination. */}
        <div className="mast-end ml-auto flex items-center gap-3 max-[384px]:gap-2">
          <a
            href="/resume.pdf"
            className={`${mastButton('ghost')} mast-resume max-[1100px]:hidden`}
          >
            Resume (PDF)
          </a>
          {onOpenSearch && (
            <SearchButton
              onOpen={onOpenSearch}
              onPreload={onPreloadSearch}
              open={searchOpen}
            />
          )}
          <button
            type="button"
            className={mastButton()}
            aria-label={`Switch to ${target} theme`}
            onClick={onToggleTheme}
          >
            {/* On a phone the words give way to the icon of the theme it
                switches to (a sun to go light, a moon to go dark), so the
                button no longer reads as the current mode; the accessible
                name stays whole (aria-label). */}
            <ThemeIcon target={target} />
            <span className="max-[700px]:sr-only">Switch to {target}</span>
          </button>
          <button
            type="button"
            ref={menuRef}
            className={`${mastButton()} mast-menu min-[961px]:hidden`}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            Menu
          </button>
        </div>
      </div>
      <MobileNavSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={items}
        more={more}
        returnFocusRef={menuRef}
      />
    </header>
  )
}

/** The icon of the theme the toggle switches to; shown on a phone only. */
function ThemeIcon({ target }) {
  return (
    <svg
      className="hidden size-5 max-[700px]:block"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon={target === 'light' ? 'sun' : 'moon'}
    >
      {target === 'light' ? (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      ) : (
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      )}
    </svg>
  )
}
