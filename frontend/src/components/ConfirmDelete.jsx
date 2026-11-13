import { useEffect, useId, useRef, useState } from 'react'

/**
 * A Delete button that asks in place before it deletes: pressing it swaps
 * in "Delete for good" / "Keep it" (the pattern in GarmentForm). No browser
 * dialog, so it works the same on touch and in tests. While the delete is
 * in flight both buttons are disabled, so a double-click sends one request.
 *
 * @param {object} props
 * @param {() => (void | Promise<void>)} props.onConfirm  Runs only from "Delete for good".
 * @param {string} [props.subject]  What is being deleted; names the button for screen readers.
 * @param {string} [props.className]  Class for the Delete button.
 * @param {string} [props.label]  The first button's words; Delete by default.
 *   Redo reuses this component with its own words.
 * @param {string} [props.name]  The first button's accessible name when it
 *   differs from `label` plus `subject` (the bulk bar's "Delete 5").
 * @param {string} [props.confirmLabel]  The confirming button's words.
 * @param {string} [props.intro]  A first line shown once armed (Redo says
 *   where the row goes).
 * @param {string|null} [props.detail]  The line shown once armed: the row's
 *   name and what goes with it (docs/design-system.md, One of each).
 * @param {boolean} [props.ready]  False holds the confirming button off
 *   while `detail` is still being read, or could not be.
 * @param {() => void} [props.onArm]  Called when the first button is
 *   pressed, so the page can fetch `detail`.
 */
export default function ConfirmDelete({
  onConfirm,
  subject,
  className,
  label = 'Delete',
  name,
  confirmLabel = 'Delete for good',
  intro,
  detail,
  ready = true,
  onArm,
}) {
  const detailId = useId()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const deleteRef = useRef(null)
  const keepRef = useRef(null)
  const refocus = useRef(false)

  // Move focus with the swap so it never falls onto the page body.
  useEffect(() => {
    if (confirming) keepRef.current?.focus()
    else if (refocus.current) {
      refocus.current = false
      deleteRef.current?.focus()
    }
  }, [confirming])

  function close() {
    refocus.current = true
    setConfirming(false)
  }

  async function confirm() {
    if (busy) return
    setBusy(true)
    try {
      await onConfirm()
    } catch (error) {
      // The caller reports its own errors; log this one so a caller that
      // throws is visible, then bring the button back.
      console.error(error)
    }
    // A successful delete usually unmounts this; if it did not, ask again.
    setBusy(false)
    close()
  }

  if (confirming) {
    return (
      <>
        {(intro || detail) && (
          <span className="confirm-detail" id={detailId} role="status">
            {intro} {detail}
          </span>
        )}
        <button
          type="button"
          className="btn danger"
          aria-label={
            subject
              ? confirmLabel === 'Delete for good'
                ? `Delete ${subject} for good`
                : `${confirmLabel}, ${subject}`
              : undefined
          }
          aria-describedby={detail ? detailId : undefined}
          disabled={busy || !ready}
          aria-busy={busy}
          onClick={confirm}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          ref={keepRef}
          className="btn ghost"
          aria-label={subject ? `Keep ${subject}` : undefined}
          disabled={busy}
          onClick={close}
        >
          Keep it
        </button>
      </>
    )
  }
  return (
    <button
      type="button"
      ref={deleteRef}
      className={className}
      aria-label={name ?? (subject ? `${label} ${subject}` : undefined)}
      onClick={() => {
        setConfirming(true)
        onArm?.()
      }}
    >
      {label}
    </button>
  )
}
