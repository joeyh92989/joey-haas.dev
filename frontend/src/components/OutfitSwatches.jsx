import { imageUrl } from '../lib/closet.js'

/**
 * An outfit as small squares, one per garment: its photo, else its main
 * colour. The garment names are the caller's text, so the squares are
 * decoration.
 *
 * @param {object} props
 * @param {{slot: string, id: string, primary_hex: string|null, image: string|null}[]} props.garments
 */
export default function OutfitSwatches({ garments }) {
  return (
    <span className="outfit-swatches" aria-hidden="true">
      {garments.map((garment) => (
        <Swatch key={`${garment.slot}-${garment.id}`} garment={garment} />
      ))}
    </span>
  )
}

/** One garment's square: the photo, or the colour the tagger recorded. */
export function Swatch({ garment, className = 'outfit-swatch' }) {
  const src = imageUrl(garment)
  if (src) {
    return (
      <span className={className}>
        <img src={src} alt="" loading="lazy" />
      </span>
    )
  }
  // The garment's own colour from its tags: data, not a theme color.
  return (
    <span
      className={className}
      style={
        garment.primary_hex ? { backgroundColor: garment.primary_hex } : null
      }
    />
  )
}
