/** The city every place defaults to, and the only one that can be public. */
export const HOME_CITY = 'denver'

/** Cities offered when the saved spots have none besides Denver. */
export const FALLBACK_CITIES = ['boulder', 'golden', 'fort collins']

/** A city as the server keeps it: trimmed, spaces collapsed, lower case. */
export function cityKey(city) {
  return String(city ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** A city key as a label: "fort collins" as "Fort Collins". */
export function cityLabel(city) {
  // Not \b: it is ASCII-only, so "éclair" would come out "éClair".
  return city.replace(
    /(^|[\s-])(\p{L})/gu,
    (_, gap, letter) => gap + letter.toUpperCase(),
  )
}

/** The distinct cities on these spots other than Denver, as sorted keys. */
export function citiesFrom(spots) {
  const found = new Set()
  for (const spot of spots ?? []) {
    const city = cityKey(spot.city)
    if (city && city !== HOME_CITY) found.add(city)
  }
  return [...found].sort()
}

/** `[{city, count}]` for every city on these spots, Denver first, then A to Z. */
export function cityCounts(spots) {
  const counts = new Map()
  for (const spot of spots ?? []) {
    const city = cityKey(spot.city) || HOME_CITY
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
