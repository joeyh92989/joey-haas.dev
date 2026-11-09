import { photoSrc, photoSrcSet } from '../lib/trips.js'

/**
 * One trip photo with its caption strip.
 *
 * New rather than `CoverImage`, which exists for hotlinked covers with no
 * intrinsic size: a trip photo is built in two widths, so it carries a
 * `srcset`, and its `width` and `height` reserve its box before it loads.
 *
 * The caption is an opaque `--bg` strip across the bottom edge (design D3):
 * a scrim over an arbitrary photo guarantees no contrast. It is the
 * markdown's quoted caption, or the alt text when there is none. That
 * fallback is hidden from screen readers, which have just read the alt.
 *
 * With `onOpen`, the image is a button that opens the lightbox; the button
 * is named by the image's alt, so it reads as the photo it opens.
 *
 * @param {object} props
 * @param {string} props.slug The trip's slug, for the built image's path.
 * @param {{name: string, alt: string, caption: string|null, width: number|null, height: number|null}} props.photo
 * @param {string} props.sizes The `sizes` for the layout it sits in.
 * @param {boolean} [props.eager]
 * @param {(opener: HTMLElement) => void} [props.onOpen]
 */
export default function TripPhoto({
  slug,
  photo,
  sizes,
  eager = false,
  onOpen,
}) {
  const image = (
    <img
      className="trip-photo__img"
      src={photoSrc(slug, photo.name, 800)}
      srcSet={photoSrcSet(slug, photo.name)}
      sizes={sizes}
      width={photo.width ?? undefined}
      height={photo.height ?? undefined}
      loading={eager ? 'eager' : 'lazy'}
      alt={photo.alt}
    />
  )
  return (
    <figure className="trip-photo">
      {onOpen ? (
        <button
          type="button"
          className="trip-photo__open"
          onClick={(event) => onOpen(event.currentTarget)}
        >
          {image}
        </button>
      ) : (
        image
      )}
      <figcaption className="trip-photo__caption">
        {photo.caption ?? <span aria-hidden="true">{photo.alt}</span>}
      </figcaption>
    </figure>
  )
}
