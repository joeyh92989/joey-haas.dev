/**
 * Small helpers shared by the travel index and the trip page. Pure: they
 * take a compiled trip module ({slug, frontmatter, days, cover}) and never
 * import the content, so their callers' tests need no markdown.
 */

/** The two widths `scripts/build-travel-images.mjs` writes for each photo. */
export const PHOTO_WIDTHS = [800, 1600]

/** The URL of one built size of a trip photo. */
export function photoSrc(slug, name, width) {
  return `/travel/${slug}/${name}-${width}.webp`
}

/** `srcset` for a trip photo, both built widths. */
export function photoSrcSet(slug, name) {
  return PHOTO_WIDTHS.map(
    (width) => `${photoSrc(slug, name, width)} ${width}w`,
  ).join(', ')
}

/**
 * Every photo the trip shows in its days, in page order, each with the id
 * of its day. A name shown on two days is listed once, at its first: the
 * lightbox steps through photos, not appearances.
 *
 * @returns {{name: string, alt: string, caption: string|null, width: number|null, height: number|null, dayId: string}[]}
 */
export function tripPhotos(trip) {
  const seen = new Set()
  const photos = []
  for (const day of trip.days) {
    for (const photo of day.photos) {
      if (seen.has(photo.name)) continue
      seen.add(photo.name)
      photos.push({ ...photo, dayId: day.id })
    }
  }
  return photos
}

/**
 * A place name as a URL fragment: *Dubrovnik* → `dubrovnik`, *Hvar Town* →
 * `hvar-town`, accents folded (*Korčula* → `korcula`), so a
 * shared `/travel#korcula` link survives being typed by hand.
 */
export function placeSlug(name) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
