import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { adminCopy } from '../content/adminCopy.js'
import { cx } from '../lib/cx.js'
import {
  ACCT,
  ACCT_ARROW,
  ACCT_CARET,
  ACCT_CARET_UP,
  ACCT_ERROR,
  ACCT_LIST,
  ACCT_PANEL_PHONE,
  ACCT_PANEL_RAIL,
  ACCT_RAIL,
  ACCT_WHO,
  ACCT_WHO_EMAIL,
  ACCT_WHO_LABEL,
  AREA_LABEL,
  MARK,
  accountPill,
  accountRail,
  accountRow,
} from './adminShellClasses.js'

/**
 * The admin account menu: a disclosure button and a plain panel of the
 * signed-in email, a link to the site and Sign out. Not `role="menu"`, so
 * there are no arrow keys to build; Tab walks the panel, which follows the
 * button in the page.
 *
 * Escape closes and returns focus to the button, a press outside closes,
 * and so does Tabbing out. Sign out has no confirm step. While it is in
 * flight the row reads "Signing out…" and ignores a press (`aria-disabled`,
 * not `disabled`, so focus stays on it); a failure stays in the open panel.
 *
 * @param {object} props
 * @param {string|null} props.email The signed-in account.
 * @param {'rail'|'pill'} props.variant `rail`: the `jh` mark with an Account
 *   label at the head of the desktop rail, the panel opening to its right.
 *   `pill`: the mark and a caret on a phone, the panel opening below.
 * @param {() => void} props.onSignOut Signs out; the layout owns the result.
 * @param {boolean} [props.pending] A sign-out is in flight.
 * @param {boolean} [props.failed] The last sign-out failed.
 */
export default function AccountMenu({
  email,
  variant,
  onSignOut,
  pending = false,
  failed = false,
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const panelId = useId()
  const rail = variant === 'rail'

  useEffect(() => {
    if (!open) return
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function onBlur(event) {
    // Focus left for somewhere outside the menu: close and let it go there.
    const next = event.relatedTarget
    if (open && next && !rootRef.current?.contains(next)) setOpen(false)
  }

  function signOut() {
    if (pending) return
    onSignOut()
  }

  return (
    <div
      className={cx('acct', ACCT, rail && ACCT_RAIL)}
      ref={rootRef}
      onBlur={onBlur}
    >
      <button
        type="button"
        ref={buttonRef}
        className={rail ? accountRail : accountPill}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${adminCopy.shell.account}, ${email}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={MARK} aria-hidden="true">
          {adminCopy.shell.mark}
        </span>
        {rail ? (
          <span className={AREA_LABEL}>{adminCopy.shell.account}</span>
        ) : (
          <svg
            className={cx(ACCT_CARET, open && ACCT_CARET_UP)}
            viewBox="0 0 12 12"
            width="12"
            height="12"
            aria-hidden="true"
          >
            <path
              d="M2.5 4.5 6 8l3.5-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      <div
        className={cx('acct-panel', rail ? ACCT_PANEL_RAIL : ACCT_PANEL_PHONE)}
        id={panelId}
        hidden={!open}
      >
        <p className={ACCT_WHO}>
          <span className={ACCT_WHO_LABEL}>{adminCopy.shell.signedInAs}</span>
          <span className={ACCT_WHO_EMAIL}>{email}</span>
        </p>
        <ul className={cx('acct-list', ACCT_LIST)}>
          <li>
            <Link to="/" className={accountRow}>
              {adminCopy.shell.viewSite}{' '}
              <span className={ACCT_ARROW} aria-hidden="true">
                ↗
              </span>
            </Link>
          </li>
          <li>
            <button
              type="button"
              className={accountRow}
              aria-disabled={pending ? 'true' : undefined}
              onClick={signOut}
            >
              <span>
                {pending ? adminCopy.shell.signingOut : adminCopy.shell.signOut}
              </span>
            </button>
          </li>
        </ul>
        {failed && (
          <p className={ACCT_ERROR} role="alert">
            {adminCopy.shell.signOutFailed}
          </p>
        )}
      </div>
    </div>
  )
}
