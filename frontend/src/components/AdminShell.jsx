import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { useMediaQuery } from '../lib/useMediaQuery.js'
import { useRouteFocus } from '../lib/useRouteFocus.js'

/**
 * The admin navigation, in sidebar order. Routes keep their old URLs; only
 * the labels moved ("Collection" is the Shelf, "Catalog" is Sources).
 */
export const ADMIN_GROUPS = [
  {
    label: 'Overview',
    items: [{ to: '/admin', label: 'Dashboard', end: true }],
  },
  {
    label: 'Collection',
    items: [
      { to: '/admin/collection', label: 'Shelf', count: true },
      { to: '/admin/import', label: 'Import photos' },
    ],
  },
  {
    label: 'Recommend',
    items: [
      { to: '/admin/play-next', label: 'Play Next' },
      { to: '/admin/discover', label: 'Discover' },
      { to: '/admin/radar', label: 'Radar' },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { to: '/admin/catalogue', label: 'Sources' },
      { to: '/admin/store-list', label: 'Store list' },
    ],
  },
]

/** The phone tab bar's sheets: a tab that groups pages rather than being one. */
const SHEETS = {
  picks: {
    label: 'Picks',
    items: ADMIN_GROUPS[2].items,
  },
  stores: {
    label: 'Stores',
    items: ADMIN_GROUPS[3].items,
  },
  more: {
    label: 'More',
    items: [{ to: '/admin/import', label: 'Import photos' }],
  },
}

/** Whether a pathname is one of the links or nested under one. */
function within(items, pathname) {
  return items.some(
    (item) =>
      pathname === item.to || (!item.end && pathname.startsWith(`${item.to}/`)),
  )
}

/**
 * The Shelf link's owned count: shown beside the label, and read out as
 * part of it.
 */
function OwnedCount({ value }) {
  if (value === null || value === undefined) return null
  return (
    <>
      <span className="admin-side-count" aria-hidden="true">
        {value}
      </span>
      <span className="visually-hidden">{`, ${value} owned`}</span>
    </>
  )
}

/**
 * One of the tab bar's sheets: a native modal <dialog>, as the site's
 * MobileNavSheet is, so focus is trapped and the page behind is inert.
 * Escape, the Close button, a click on the backdrop and following a link
 * all close it through `onClose`, and focus goes back to the tab.
 */
function TabSheet({ sheet, open, onClose, returnFocusRef, children }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) {
      dialog.close()
      returnFocusRef.current?.focus()
    }
  }, [open, returnFocusRef])

  return (
    <dialog
      ref={ref}
      className="nav-sheet admin-sheet"
      aria-label={sheet.label}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClose={() => {
        if (open) onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {open && (
        <div className="nav-sheet-body">
          <div className="nav-sheet-head">
            <span className="kicker">{sheet.label}</span>
            <button type="button" className="btn sm" onClick={onClose}>
              Close
            </button>
          </div>
          <nav aria-label={sheet.label}>
            {sheet.items.map((item) => (
              <NavLink key={item.to} to={item.to} onClick={onClose}>
                {item.label}
              </NavLink>
            ))}
            {children}
          </nav>
        </div>
      )}
    </dialog>
  )
}

/**
 * The admin frame: a sidebar on a desktop, a five-item tab bar on a phone,
 * and the routed page in <main> beside or above it. It replaces the public
 * masthead and footer on every /admin route once signed in.
 *
 * @param {object} props
 * @param {string|null} props.email The signed-in account.
 * @param {number|null} props.ownedCount Shown beside Shelf once loaded.
 * @param {() => void} props.onSignOut Signs out; the layout owns the result.
 * @param {import('react').ReactNode} props.children The routed page.
 */
export default function AdminShell({ email, ownedCount, onSignOut, children }) {
  const phone = useMediaQuery('(max-width: 700px)')
  const mainRef = useRouteFocus()
  const { pathname } = useLocation()
  const [sheet, setSheet] = useState(null)
  const tabRefs = {
    picks: useRef(null),
    stores: useRef(null),
    more: useRef(null),
  }

  return (
    <div className={phone ? 'admin-app admin-app-phone' : 'admin-app'}>
      {!phone && (
        <aside className="admin-side">
          <Link to="/admin" className="brand">
            <span className="mark" aria-hidden="true">
              JH
            </span>
            Admin
          </Link>
          <nav aria-label="Admin" className="admin-side-nav">
            {ADMIN_GROUPS.map((group) => (
              <div key={group.label} className="admin-side-group">
                <p className="kicker" id={`admin-group-${group.label}`}>
                  {group.label}
                </p>
                <ul aria-labelledby={`admin-group-${group.label}`}>
                  {group.items.map((item) => (
                    <li key={item.to}>
                      <NavLink to={item.to} end={item.end}>
                        {item.label}
                        {item.count && <OwnedCount value={ownedCount} />}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className="admin-side-foot">
            {email && <p className="admin-side-email">{email}</p>}
            <p>
              <Link to="/">
                View site <span aria-hidden="true">↗</span>
              </Link>
              {' · '}
              <button type="button" className="link-button" onClick={onSignOut}>
                Sign out
              </button>
            </p>
          </div>
        </aside>
      )}

      <main id="main" ref={mainRef} tabIndex={-1} className="admin-main">
        {children}
      </main>

      {phone && (
        <>
          <nav aria-label="Admin" className="admin-tabs">
            <NavLink to="/admin" end>
              Home
            </NavLink>
            <NavLink to="/admin/collection">Shelf</NavLink>
            {Object.entries(SHEETS).map(([key, value]) => {
              const current = within(value.items, pathname)
              return (
                <button
                  key={key}
                  type="button"
                  ref={tabRefs[key]}
                  className={current ? 'active' : undefined}
                  aria-current={current ? 'true' : undefined}
                  aria-haspopup="dialog"
                  aria-expanded={sheet === key}
                  onClick={() => setSheet(key)}
                >
                  {value.label}
                </button>
              )
            })}
          </nav>
          {Object.entries(SHEETS).map(([key, value]) => (
            <TabSheet
              key={key}
              sheet={value}
              open={sheet === key}
              onClose={() => setSheet(null)}
              returnFocusRef={tabRefs[key]}
            >
              {key === 'more' && (
                <>
                  <Link to="/" onClick={() => setSheet(null)}>
                    View site <span aria-hidden="true">↗</span>
                  </Link>
                  <button
                    type="button"
                    className="link-button admin-sheet-signout"
                    onClick={() => {
                      setSheet(null)
                      onSignOut()
                    }}
                  >
                    Sign out
                  </button>
                  {email && <p className="muted admin-sheet-email">{email}</p>}
                </>
              )}
            </TabSheet>
          ))}
        </>
      )}
    </div>
  )
}
