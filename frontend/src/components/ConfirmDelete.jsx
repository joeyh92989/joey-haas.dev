import { useEffect, useRef, useState } from 'react'

/**
 * A Delete button that asks in place before it deletes: pressing it swaps
 * in "Delete for good" / "Keep it" (the pattern in GarmentForm). No browser
 * dialog, so it works the same on touch and in tests.
 *
 * @param {object} props
 * @param {() => (void | Promise<void>)} props.onConfirm  Runs only from "Delete for good".
 * @param {string} [props.subject]  What is being deleted; names the button for screen readers.
 * @param {string} [props.className]  Class for the Delete button.
 */
export default function ConfirmDelete({ onConfirm, subject, className }) {
  const [confirming, setConfirming] = useState(false)
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
    try {
      await onConfirm()
    } finally {
      // Still mounted when the delete failed: put the button back.
      if (deleteRef.current === null && keepRef.current) close()
    }
  }

  if (confirming) {
    return (
      <>
        <button type="button" className="danger" onClick={confirm}>
          Delete for good
        </button>
        <button type="button" ref={keepRef} onClick={close}>
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
