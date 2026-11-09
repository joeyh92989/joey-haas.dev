import { useEffect, useRef } from 'react'

import { photoSrc, photoSrcSet } from '../lib/trips.js'

/**
 * A trip's photos, one at a time, in a native modal `<dialog>`.
 *
 * The pattern the search dialog and the Wrap up sheet use: `showModal()`
 * traps focus and inerts the page, the owner holds the state, and every way
 * of closing (Escape, the close button, a backdrop press) goes through
 * `onClose`. The backdrop closes only when the press began on it too, so a
 * drag that ends past the image is not a dismissal.
 *
 * Focus goes back to `opener` once the dialog has closed. It is passed in
 * rather than read from `document.activeElement`, because Safari does not
 * focus a button when it is clicked.
 *
 * ← and → move, wrapping at both ends; the buttons name where they go
 * (*Next photo, 3 of 12*), so the counter is not the only way to know.
 *
 * @param {object} props
 * @param {string} props.slug
 * @param {object[]} props.photos Every photo on the page, from `tripPhotos`.
 * @param {number|null} props.index The photo showing, or null while closed.
 * @param {(index: number) => void} props.onIndex
 * @param {() => void} props.onClose
 * @param {HTMLElement|null} [props.opener]
 */
export default function Lightbox({
  slug,
  photos,
  index,
  onIndex,
  onClose,
  opener = null,
}) {
  const ref = useRef(null)
  const returnFocus = useRef(null)
  const pressedBackdrop = useRef(false)
  const open = index != null

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      returnFocus.current = opener ?? document.activeElement
      dialog.showModal()
      dialog.querySelector('.lightbox__next, .lightbox__close')?.focus()
    }
    if (!open && dialog.open) {
      dialog.close()
      if (returnFocus.current?.isConnected) returnFocus.current.focus?.()
      returnFocus.current = null
    }
  }, [open, opener])

  const count = photos.length
  const step = (by) => (index + by + count) % count
  const photo = open ? photos[index] : null

  function handleCancel(event) {
    event.preventDefault()
    onClose()
  }

  function handleClose() {
    if (open) onClose()
  }

  function handleKeyDown(event) {
    if (!open || count < 2) return
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      onIndex(step(1))
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onIndex(step(-1))
    }
  }

  function handlePointerDown(event) {
    pressedBackdrop.current = event.target === event.currentTarget
  }

  function handleClick(event) {
    if (event.target === event.currentTarget && pressedBackdrop.current) {
      onClose()
    }
    pressedBackdrop.current = false
  }

  return (
    <dialog
      ref={ref}
      className="lightbox"
      aria-label="Photos"
      onCancel={handleCancel}
      onClose={handleClose}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      {photo && (
        <>
          <figure className="lightbox__figure">
            <img
              className="lightbox__img"
              src={photoSrc(slug, photo.name, 1600)}
              srcSet={photoSrcSet(slug, photo.name)}
              sizes="100vw"
              width={photo.width ?? undefined}
              height={photo.height ?? undefined}
              alt={photo.alt}
            />
            <figcaption className="lightbox__caption">
              {photo.caption ?? photo.alt}
              <span className="lightbox__count">
                {index + 1} of {count}
              </span>
            </figcaption>
          </figure>
          <div className="lightbox__controls">
            {count > 1 && (
              <button
                type="button"
                className="lightbox__prev"
                aria-label={`Previous photo, ${step(-1) + 1} of ${count}`}
                onClick={() => onIndex(step(-1))}
              >
                ←
              </button>
            )}
            {count > 1 && (
              <button
                type="button"
                className="lightbox__next"
                aria-label={`Next photo, ${step(1) + 1} of ${count}`}
                onClick={() => onIndex(step(1))}
              >
                →
              </button>
            )}
            <button
              type="button"
              className="lightbox__close"
              aria-label="Close photos"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </>
      )}
    </dialog>
  )
}
