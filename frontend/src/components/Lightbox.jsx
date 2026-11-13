import Sheet from './Sheet.jsx'
import { photoSrc, photoSrcSet } from '../lib/trips.js'

/**
 * A trip's photos, one at a time, in a native modal `<dialog>`.
 *
 * It renders through Sheet: `showModal()` traps focus and inerts the page,
 * the owner holds the state, and every way of closing (Escape, the close
 * button, a backdrop press) goes through `onClose`.
 *
 * Focus goes back to `opener` once the dialog has closed. It is passed in
 * rather than read from `document.activeElement`, because Safari does not
 * focus a button when it is clicked.
 *
 * ← and → move, wrapping at both ends; the buttons name where they go
 * (*Next photo, 3 of 12*), so the counter is not the only way to know.
 * The caption strip is a polite live region: a step changes only the image
 * and the strip, so without it a screen reader hears nothing after ←/→.
 * Beneath the caption, the day the photo was taken on, as the spec has it.
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
  const open = index != null

  const count = photos.length
  const step = (by) => (index + by + count) % count
  const photo = open ? photos[index] : null

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

  return (
    <Sheet
      open={open}
      onClose={onClose}
      ariaLabel="Photos"
      variant="bare"
      className="lightbox"
      initialFocus=".lightbox__next, .lightbox__close"
      returnFocus={opener}
      onKeyDown={handleKeyDown}
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
            <figcaption className="lightbox__caption" aria-live="polite">
              <span>{photo.caption ?? photo.alt}</span>
              <span className="lightbox__count">
                {photo.day && `${photo.day} · `}
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
    </Sheet>
  )
}
