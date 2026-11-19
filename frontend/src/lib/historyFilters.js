import { TAGS } from '../content/denver.js'
import { HOME_CITY, cityLabel, spotCity } from './cities.js'

/** The verdicts the filter offers, in the order the sheet lists them. */
export const VERDICT_FILTERS = ['loved', 'fine', 'not_again']

/** No filter on. `kid` is a boolean; the rest are a value or null. */
export const NO_FILTERS = {
  city: null,
  tag: null,
  verdict: null,
  kid: false,
  spot: null,
}

/** The URL keys the filters own, in the order they are written. */
const SPOT_KEY = 'spot'
const KEYS = ['city', 'tag', 'verdict', 'kid', SPOT_KEY]

/** The History link for one place: the page filtered to that spot's id. */
export function historyHrefForSpot(id) {
  return `/admin/history?${new URLSearchParams({ [SPOT_KEY]: String(id) })}`
}

/** The city keys that occur in these outings, Denver first, then A to Z. */
function citiesIn(rows) {
  return [...new Set(rows.map(spotCity))].sort((a, b) => {
    if (a === HOME_CITY) return -1
    if (b === HOME_CITY) return 1
    return a < b ? -1 : a > b ? 1 : 0
  })
}

/**
 * The filter a URL asks for. A value that is not one of the choices these
 * outings offer is ignored, as if unset: a stale link shows everything
 * rather than an empty page. `spot` is an id, kept as given: a place with no
 * outings is a real answer ("nothing here yet"), not a typo.
 *
 * @param {URLSearchParams} params
 * @param {object[]} rows The outings as the server sent them.
 * @returns {typeof NO_FILTERS}
 */
export function parseFilters(params, rows) {
  const city = params.get('city')
  const tag = params.get('tag')
  const verdict = params.get('verdict')
  const spot = params.get(SPOT_KEY)?.toLowerCase()
  return {
    city: city && citiesIn(rows).includes(city) ? city : null,
    tag: tag && rows.some((row) => row.tags?.includes(tag)) ? tag : null,
    verdict:
      verdict &&
      VERDICT_FILTERS.includes(verdict) &&
      rows.some((row) => row.verdict === verdict)
        ? verdict
        : null,
    kid: params.get('kid') === '1',
    spot: spot || null,
  }
}

/**
 * These params with the filter keys set from `filters` (others untouched).
 * Unset ones are removed, so the URL carries only what is on.
 */
export function writeFilters(params, filters) {
  const next = new URLSearchParams(params)
  for (const key of KEYS) {
    const value = filters[key]
    if (key === 'kid') {
      if (value) next.set('kid', '1')
      else next.delete('kid')
    } else if (value) next.set(key, value)
    else next.delete(key)
  }
  return next
}

/** How many filters are on. */
export function activeCount(filters) {
  return KEYS.filter((key) => Boolean(filters[key])).length
}

/** The outings that pass every filter that is on (they AND together). */
export function applyFilters(rows, filters) {
  return rows.filter(
    (row) =>
      (!filters.city || spotCity(row) === filters.city) &&
      (!filters.tag || row.tags?.includes(filters.tag)) &&
      (!filters.verdict || row.verdict === filters.verdict) &&
      (!filters.kid || row.kid_along === true) &&
      (!filters.spot || String(row.spot_id).toLowerCase() === filters.spot),
  )
}

/**
 * The choices, each with its count over the unfiltered outings. Only values
 * that occur are listed: cities Denver first then A to Z, tags in the
 * vocabulary's order, the three verdicts (no "No verdict" choice).
 *
 * @param {object[]} rows
 */
export function filterOptions(rows) {
  const count = (test) => rows.filter(test).length
  return {
    cities: citiesIn(rows).map((city) => ({
      value: city,
      label: cityLabel(city),
      count: count((row) => spotCity(row) === city),
    })),
    tags: TAGS.filter((tag) => rows.some((row) => row.tags?.includes(tag))).map(
      (tag) => ({
        value: tag,
        count: count((row) => row.tags?.includes(tag)),
      }),
    ),
    verdicts: VERDICT_FILTERS.map((verdict) => ({
      value: verdict,
      count: count((row) => row.verdict === verdict),
    })).filter((option) => option.count > 0),
    kid: count((row) => row.kid_along === true),
  }
}

/**
 * The header's counts for the filtered outings in one year. The year is read
 * off the stored date's text ('YYYY-MM-DD'; month and year outings sit at
 * their period's start), so no zone can move an outing across New Year.
 *
 * @param {object[]} matches Outings that passed the filter.
 * @param {number} year
 */
export function filteredYearCounts(matches, year) {
  const inYear = matches.filter(
    (row) => Number(row.visited_on.slice(0, 4)) === year,
  )
  return {
    outings: inYear.length,
    places: new Set(inYear.map((row) => row.spot_id)).size,
    loved: inYear.filter((row) => row.verdict === 'loved').length,
  }
}

/**
 * Whether the sheet has anything to choose: a city row (more than one city),
 * a tag or verdict chip that narrows the list, or kid outings.
 *
 * @param {ReturnType<typeof filterOptions>} options
 * @param {number} total How many outings there are.
 */
export function hasChoices(options, total) {
  const narrows = (list) =>
    list.length > 1 || (list.length === 1 && list[0].count < total)
  return (
    options.cities.length > 1 ||
    narrows(options.tags) ||
    narrows(options.verdicts) ||
    options.kid > 0
  )
}

/** The name the Place filter shows: the spot's own, from its outings. */
export function placeName(rows, spotId) {
  return (
    rows.find((row) => String(row.spot_id).toLowerCase() === spotId)
      ?.spot_name ?? null
  )
}
