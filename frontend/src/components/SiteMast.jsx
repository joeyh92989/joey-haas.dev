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
    <header className="mast">
      <div className="wrap mast-row">
        <Link to="/" className="brand">
          <span className="mark" aria-hidden="true">
            JH
          </span>
          {profile.name}
        </Link>
        <nav className="site-nav" aria-label="Site">
          {items.map((item) => (
            <MastNavLink key={item.to} item={item} />
          ))}
          {more.length > 0 && <MoreMenu items={more} />}
        </nav>
        {/* Outside <nav>: the toggle is a control, not a destination. */}
        <div className="mast-end">
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
            {/* On a phone the label shortens to Light or Dark so the bar fits
                320px; the accessible name stays whole (aria-label). */}
            <span>
              <span className="max-[700px]:sr-only">Switch to </span>
              <span className="max-[700px]:capitalize">{target}</span>
            </span>
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
