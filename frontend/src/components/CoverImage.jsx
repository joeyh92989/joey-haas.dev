import { useState } from 'react'

/**
 * Cover art with a placeholder fallback and a per-type aspect ratio.
 *
 * Covers are hotlinked from whichever source supplied them, so a dead URL is a
 * question of when rather than whether. The fallback is the mitigation for not
 * caching images locally.
 *
 * The ratio is per type because the sources genuinely disagree: film posters
 * are 2:3, game covers nearer 3:4, and board game box shots are roughly
 * square. A grid that assumed one ratio would look broken on half a mixed
 * shelf.
 *
 * @param {object} props
 * @param {string|null} props.src - Cover URL, or null when there is none.
 * @param {string} props.type - One of the ItemType values.
 * @param {string} [props.alt] - Accessible name; empty when purely decorative.
 * @param {boolean} [props.priority] - The page's main image (an item page's
 *   cover): fetched at once rather than lazily, since it is what the page is
 *   waiting to paint.
 */
export default function CoverImage({ src, type, alt = '', priority = false }) {
  // The URL that failed, not a flag: a new src (the live item replacing the
  // snapshot, or a re-link) gets its own try.
  const [failedSrc, setFailedSrc] = useState(null)
  const missing = !src || failedSrc === src

  return (
    <span className={`cover cover-${type}`} data-missing={missing || undefined}>
      {missing ? (
        <span className="cover-placeholder" aria-hidden="true" />
      ) : (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          onError={() => setFailedSrc(src)}
        />
      )}
    </span>
  )
}
