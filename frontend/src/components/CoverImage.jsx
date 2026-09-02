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
 */
export default function CoverImage({ src, type, alt = '' }) {
  const [failed, setFailed] = useState(false)
  const missing = !src || failed

  return (
    <span className={`cover cover-${type}`} data-missing={missing || undefined}>
      {missing ? (
        <span className="cover-placeholder" aria-hidden="true" />
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  )
}
