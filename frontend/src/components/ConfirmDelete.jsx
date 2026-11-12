import { useEffect, useRef, useState } from 'react'

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
 */
export default function ConfirmDelete({ onConfirm, subject, className }) {
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
    } catch {
      // The caller reports its own errors; here the button just comes back.
    }
    // A successful delete usually unmounts this; if it did not, ask again.
    setBusy(false)
    close()
  }

  if (confirming) {
    return (
      <>
        <button
          type="button"
          className="danger"
          disabled={busy}
          aria-busy={busy}
          onClick={confirm}
        >
          Delete for good
        </button>
        <button type="button" ref={keepRef} disabled={busy} onClick={close}>
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
      aria-label={subject ? `Delete ${subject}` : undefined}
      onClick={() => setConfirming(true)}
    >
      Delete
    </button>
  )
}
