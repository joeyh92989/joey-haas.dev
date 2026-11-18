/** The city every place defaults to, and the only one that can be public. */
export const HOME_CITY = 'denver'

/** Cities offered when the saved spots have none besides Denver. */
export const FALLBACK_CITIES = ['boulder', 'golden', 'fort collins']

const SPACE_CONTROLS = ['\u001c', '\u001d', '\u001e', '\u001f', '\u0085']

/**
 * A city as the server keeps it (`normalize_city`): control and zero-width
 * characters dropped (format characters such as joiners included), outer
 * space trimmed, inner runs collapsed to one space, lower case.
 */
export function cityKey(city) {
  return (
    String(city ?? '')
      // The server (Python) counts these as spaces, so they separate
      // words rather than vanish.
      .replace(/[\p{Cc}]/gu, (ch) => (SPACE_CONTROLS.includes(ch) ? ' ' : ch))
      .replace(/\p{Cf}|(?![\t\n\v\f\r])\p{Cc}/gu, '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
  )
}

/** The city key of a spot row, Denver when it has none. */
export function spotCity(spot) {
  return cityKey(spot?.city) || HOME_CITY
}

/** A city key as a label: "fort collins" as "Fort Collins". */
export function cityLabel(city) {
  // Not \b: it is ASCII-only, so "éclair" would come out "éClair".
  return city.replace(
    /(^|[\s-])(\p{L})/gu,
    (_, gap, letter) => gap + letter.toUpperCase(),
  )
}

/** `[{city, count}]` for every city on these spots, Denver first, then A to Z. */
export function cityCounts(spots) {
  const counts = new Map()
  for (const spot of spots ?? []) {
    const city = spotCity(spot)
    counts.set(city, (counts.get(city) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => {
      if (a.city === HOME_CITY) return -1
      if (b.city === HOME_CITY) return 1
      return a.city < b.city ? -1 : a.city > b.city ? 1 : 0
    })
}

/** The distinct cities on these spots other than Denver, as sorted keys. */
export function citiesFrom(spots) {
  return cityCounts(spots)
    .map(({ city }) => city)
    .filter((city) => city !== HOME_CITY)
}
