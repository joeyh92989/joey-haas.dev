import { Link } from 'react-router'
import {
  categoryLabel,
  garmentTitle,
  imageUrl,
  statLine,
} from '../lib/closet.js'
import {
  GARMENT_NAME,
  GARMENT_PHOTO,
  GARMENT_SLOT,
  GARMENT_STAT,
  GARMENT_TILE,
} from './closetClasses.js'

/**
 * One garment in the Closet grid: the photo at 4:5, the slot in mono in the
 * corner, the name and one stat line. It opens the edit form.
 *
 * The slot in the corner is decorative (`aria-hidden`) and repeated in the
 * link's name, with the stat line, so a screen reader hears all three.
 * An untagged tile carries the dashed `--warn` outline and a packed one's
 * photo is dimmed; the words say both, never the mark alone.
 *
 * @param {object} props
 * @param {object} props.garment A `GarmentOut` row.
 */
export default function GarmentTile({ garment }) {
  const title = garmentTitle(garment)
  const slot = categoryLabel(garment.category)
  const stat = statLine(garment)
  const src = imageUrl(garment, { size: 'thumb' })
  const label = [title, slot && slot.toLowerCase(), stat]
    .filter(Boolean)
    .join(', ')
  return (
    <Link
      to={`/admin/closet/${garment.id}`}
      className={`garment-tile ${GARMENT_TILE}`}
      data-status={garment.status}
      aria-label={label}
    >
      <span
        className={`garment-photo ${GARMENT_PHOTO}`}
        // The model's colour stands in until the photo loads, or for a
        // garment added by hand; it is data, not a design colour.
        style={
          garment.primary_hex
            ? { backgroundColor: garment.primary_hex }
            : undefined
        }
      >
        {src && <img src={src} alt="" loading="lazy" decoding="async" />}
        <span className={`garment-slot ${GARMENT_SLOT}`} aria-hidden="true">
          {slot ? slot.toLowerCase() : '?'}
        </span>
      </span>
      <span className={`garment-name ${GARMENT_NAME}`}>{title}</span>
      <span className={`garment-stat ${GARMENT_STAT}`}>{stat}</span>
    </Link>
  )
}
