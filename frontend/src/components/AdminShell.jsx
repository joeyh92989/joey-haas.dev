import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { useMediaQuery } from '../lib/useMediaQuery.js'
import { useRouteFocus } from '../lib/useRouteFocus.js'
import { ADMIN_AREAS, areaFor, currentPage, segmentsFor } from './adminAreas.js'

/** Below this width the rail and page list give way to tabs and segments. */
export const PHONE_QUERY = '(max-width: 900px)'

/**
 * The Collection link's owned count: shown beside the label, and read out
 * as part of it.
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
 * An area's pending count as a warn badge, read out as part of the area's
 * name ("Closet, 9 to review"). Nothing when there is nothing pending.
 */
function AreaBadge({ badge }) {
  if (!badge?.value) return null
  return (
    <>
      <span className="admin-badge" aria-hidden="true">
        {badge.value}
      </span>
      <span className="visually-hidden">{`, ${badge.value} ${badge.words}`}</span>
    </>
  )
}

/**
 * A page's pending count (the Add page's entries left to check), drawn
 * like an area's badge and read out as part of the page's name.
 */
function PageBadge({ page, badges }) {
  return page.badge ? <AreaBadge badge={badges[page.badge]} /> : null
}

/**
 * A page link marked current by the shell, not by NavLink's own matching:
 * NavLink without `end` would also mark a parent page (Closet) on its
 * child's path (/admin/closet/profile). Only the longest match is current.
 */
function PageLink({ page, current, children, onClick }) {
  return (
    <Link
      to={page.to}
      className={current ? 'active' : undefined}
      aria-current={current ? 'page' : undefined}
      onClick={onClick}
    >
      {children}
    </Link>
  )
}

/**
 * One link per area, landing on its home. The rail (desktop) and the tab
 * bar (phone) differ only in their class and layout.
 */
function AreaLinks({ current, badges, iconClass }) {
  return ADMIN_AREAS.map((area) => {
    const active = area.key === current.key
    return (
      <Link
        key={area.key}
        to={area.home}
        className={active ? 'active' : undefined}
        aria-current={active ? 'true' : undefined}
      >
        <span className={iconClass} aria-hidden="true">
          {area.icon}
        </span>
        <span className="admin-area-label">{area.label}</span>
        <AreaBadge badge={badges[area.key]} />
      </Link>
    )
  })
}

/** The desktop's first column: the areas, and a way back to the site. */
function AreaRail({ current, badges }) {
  return (
    <div className="admin-rail">
      <span className="admin-rail-mark" aria-hidden="true">
        jh
      </span>
      <nav aria-label="Areas" className="admin-rail-nav">
        <AreaLinks
          current={current}
          badges={badges}
          iconClass="admin-rail-icon"
        />
      </nav>
      <Link to="/" className="admin-rail-site" title="View site">
        <span aria-hidden="true">↗</span>
        <span className="visually-hidden">View site</span>
      </Link>
    </div>
  )
}

/** Splits a page list into runs sharing a kicker; one unnamed run if none. */
function runs(pages) {
  const out = []
  for (const page of pages) {
    const last = out[out.length - 1]
    if (last && last.group === page.group) last.pages.push(page)
    else out.push({ group: page.group, pages: [page] })
  }
  return out
}

/** The desktop's second column: the current area's pages and the account. */
function AreaPages({
  area,
  pathname,
  ownedCount,
  pageBadges,
  email,
  onSignOut,
}) {
  const here = currentPage(area.pages, pathname)
  return (
    <aside className="admin-side">
      <p className="admin-side-title">
        {area.label}
        <small>{area.description}</small>
      </p>
      <nav aria-label={`${area.label} pages`} className="admin-side-nav">
        {runs(area.pages).map((run) => (
          <div key={run.group ?? 'pages'} className="admin-side-group">
            {run.group && (
              <p className="kicker" id={`admin-group-${run.group}`}>
                {run.group}
              </p>
            )}
            <ul
              aria-labelledby={
                run.group ? `admin-group-${run.group}` : undefined
              }
            >
              {run.pages.map((page) => (
                <li key={page.to}>
                  <PageLink page={page} current={page === here}>
                    {page.label}
                    {page.count && <OwnedCount value={ownedCount} />}
                    <PageBadge page={page} badges={pageBadges} />
                  </PageLink>
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
  )
}

/**
 * A segment's sheet: a native modal <dialog>, as the site's MobileNavSheet
 * is, so focus is trapped and the page behind is inert. Escape, the Close
 * button, a click on the backdrop and following a link all close it through
 * `onClose`, and focus goes back to the segment.
 */
function TabSheet({ label, pages, open, onClose, returnFocusRef }) {
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
      aria-label={label}
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
            <span className="kicker">{label}</span>
            <button type="button" className="btn sm" onClick={onClose}>
              Close
            </button>
          </div>
          <nav aria-label={label}>
            {pages.map((page) => (
              <NavLink key={page.to} to={page.to} onClick={onClose}>
                {page.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
    </dialog>
  )
}

/**
 * The phone's segmented control: the current area's pages, or, for Shelf,
 * a few pages and sheets of the rest. A sheet segment is current when the
 * page is one of its own.
 */
function AreaSubnav({ area, pathname, pageBadges, sheet, onOpen, onClose }) {
  const segments = segmentsFor(area)
  const here = currentPage(
    segments.flatMap((segment) => segment.sheet ?? [segment]),
    pathname,
  )
  // One stable ref per sheet segment, so focus can go back to it.
  const refs = useRef({})
  const refFor = (label) => (refs.current[label] ??= { current: null })
  return (
    <>
      <nav aria-label={`${area.label} pages`} className="admin-subnav">
        {segments.map((segment) => {
          if (!segment.sheet) {
            return (
              <PageLink
                key={segment.to}
                page={segment}
                current={here?.to === segment.to}
              >
                {segment.label}
                <PageBadge page={segment} badges={pageBadges} />
              </PageLink>
            )
          }
          const current = segment.sheet.some((page) => page.to === here?.to)
          return (
            <button
              key={segment.label}
              type="button"
              ref={refFor(segment.label)}
              className={current ? 'active' : undefined}
              aria-current={current ? 'true' : undefined}
              aria-haspopup="dialog"
              aria-expanded={sheet === segment.label}
              onClick={() => onOpen(segment.label)}
            >
              {segment.label}
            </button>
          )
        })}
      </nav>
      {segments
        .filter((segment) => segment.sheet)
        .map((segment) => (
          <TabSheet
            key={segment.label}
            label={segment.label}
            pages={segment.sheet}
            open={sheet === segment.label}
            onClose={onClose}
            returnFocusRef={refFor(segment.label)}
          />
        ))}
    </>
  )
}

/**
 * The admin frame, organised by area (`adminAreas.js`). On a desktop: the
 * area rail, the current area's page list, and the routed page in <main>.
 * On a phone: the page in <main> under the area's segmented control, and a
 * tab bar of areas fixed at the foot. It replaces the public masthead and
 * footer on every /admin route once signed in.
 *
 * @param {object} props
 * @param {string|null} props.email The signed-in account.
 * @param {number|null} props.ownedCount Shown beside Collection once loaded.
 * @param {Record<string, {value: number, words: string}>} [props.badges]
 *   Pending counts per area key, e.g. `{ closet: { value: 9, words: 'to review' } }`.
 * @param {Record<string, {value: number, words: string}>} [props.pageBadges]
 *   Pending counts per page `badge` key, e.g.
 *   `{ 'intake.shelf': { value: 7, words: 'to check' } }`.
 * @param {() => void} props.onSignOut Signs out; the layout owns the result.
 * @param {import('react').ReactNode} props.children The routed page.
 */
export default function AdminShell({
  email,
  ownedCount,
  badges = {},
  pageBadges = {},
  onSignOut,
  children,
}) {
  const phone = useMediaQuery(PHONE_QUERY)
  const mainRef = useRouteFocus()
  const { pathname } = useLocation()
  const area = areaFor(pathname)
  const [sheet, setSheet] = useState(null)
  // A sheet belongs to the phone layout and to one area: crossing the
  // breakpoint or changing area closes it, or it would open again by itself
  // on the way back.
  const scope = `${phone}:${area.key}`
  const [sheetScope, setSheetScope] = useState(scope)
  if (sheetScope !== scope) {
    setSheetScope(scope)
    setSheet(null)
  }

  return (
    <div className={phone ? 'admin-app admin-app-phone' : 'admin-app'}>
      {!phone && <AreaRail current={area} badges={badges} />}
      {!phone && (
        <AreaPages
          area={area}
          pathname={pathname}
          ownedCount={ownedCount}
          pageBadges={pageBadges}
          email={email}
          onSignOut={onSignOut}
        />
      )}

      <main id="main" ref={mainRef} tabIndex={-1} className="admin-main">
        {phone && (
          <AreaSubnav
            area={area}
            pathname={pathname}
            pageBadges={pageBadges}
            sheet={sheet}
            onOpen={setSheet}
            onClose={() => setSheet(null)}
          />
        )}
        {children}
        {phone && (
          <p className="admin-phone-foot">
            {email && <span className="admin-side-email">{email}</span>}
            <Link to="/">
              View site <span aria-hidden="true">↗</span>
            </Link>
            <button type="button" className="link-button" onClick={onSignOut}>
              Sign out
            </button>
          </p>
        )}
      </main>

      {phone && (
        <nav aria-label="Areas" className="admin-tabs">
          <AreaLinks
            current={area}
            badges={badges}
            iconClass="admin-tabs-icon"
          />
        </nav>
      )}
    </div>
  )
}
