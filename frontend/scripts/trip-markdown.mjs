/**
 * The trip file's grammar, pure so the build can run it.
 *
 * A trip is `frontend/trips/<slug>.md`: frontmatter, then one `##` heading
 * per day. This module is the one authority on both halves — the Vite
 * plugin calls it at build time and its tests call it directly, the shape
 * `src/lib/changelog.js` uses, and for the same reason: a trip file that
 * does not parse should fail `npm run build` rather than the page.
 *
 * Every refusal throws with the file and the offending line in the message,
 * because the person reading it is the person who wrote the file.
 *
 * Day dates are never written in a heading. Day 1 is the trip's `date` and
 * day N is N-1 days later, so the headings cannot disagree with the
 * frontmatter, and a trip recorded only to the month (`precision: month`)
 * renders no day dates at all rather than inventing them.
 */

/** Separator between a day heading's parts, and between chained places. */
const PART = ' · '
const LEG = ' → '

/**
 * `![alt](name "caption")` alone on a line. The caption is optional, and may
 * be single- or double-quoted: prettier rewrites a markdown link title to
 * single quotes, so accepting only one would break every trip file the next
 * time the repo is formatted.
 */
const IMAGE_LINE =
  /^!\[([^\]]*)\]\(\s*([A-Za-z0-9][A-Za-z0-9-]*)\s*(?:"([^"]*)"|'([^']*)')?\s*\)$/

/** A day label: `3`, or a range `8-9` / `8–9` (hyphen or en dash). */
const DAY_LABEL = /^(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/

/** Manifest names and slugs share one safe shape; both reach a URL. */
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** How precisely a trip is dated. Old trips are often only month-accurate. */
export const PRECISIONS = ['day', 'month', 'year']

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function fail(slug, message) {
  throw new Error(`trips/${slug}.md: ${message}`)
}

/** Whether `YYYY-MM-DD` names a real calendar day. */
function isCalendarDay(value) {
  if (!ISO_DAY.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
  )
}

/**
 * Normalizes a frontmatter date to 'YYYY-MM-DD'.
 *
 * gray-matter turns an unquoted YAML date into a Date at UTC midnight, so
 * the two shapes both arrive here; storing the string avoids timezone
 * arithmetic entirely, as the posts plugin's own note explains.
 */
function toDateString(value, slug, field) {
  const text =
    value instanceof Date ? value.toISOString().slice(0, 10) : String(value)
  if (!isCalendarDay(text)) {
    fail(
      slug,
      `${field} is not a calendar day: "${text}" (expected YYYY-MM-DD)`,
    )
  }
  return text
}

/** Days from `from` to `to` inclusive; both are 'YYYY-MM-DD'. */
export function daySpan(from, to) {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Math.round(ms / 86400000) + 1
}

/** The date `offset` days after 'YYYY-MM-DD', as 'YYYY-MM-DD'. */
export function addDays(date, offset) {
  const at = new Date(`${date}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() + offset)
  return at.toISOString().slice(0, 10)
}

/**
 * Validates and normalizes a trip's frontmatter.
 *
 * @param {object} data gray-matter's parsed frontmatter.
 * @param {string} slug The file's slug, for error messages.
 * @param {string[]} [photoNames] Manifest names, to check `cover` against.
 *   Omitted when no manifest has been written yet.
 * @returns {{title: string, date: string, end: string, precision: string,
 *   summary: string, cover: string|null, places: {name: string, lat: number,
 *   lon: number}[], draft: boolean}}
 */
export function parseTripFrontmatter(data, slug, photoNames) {
  if (!NAME.test(slug)) {
    fail(
      slug,
      'the filename must be lowercase letters, digits and single hyphens',
    )
  }
  for (const field of ['title', 'date', 'end', 'summary']) {
    if (data[field] == null || String(data[field]).trim() === '') {
      fail(slug, `missing required frontmatter field: ${field}`)
    }
  }

  const date = toDateString(data.date, slug, 'date')
  const end = toDateString(data.end, slug, 'end')
  if (end < date) fail(slug, `end (${end}) is before date (${date})`)

  const precision = data.precision == null ? 'day' : String(data.precision)
  if (!PRECISIONS.includes(precision)) {
    fail(
      slug,
      `precision must be one of ${PRECISIONS.join(', ')}, not "${precision}"`,
    )
  }

  if (!Array.isArray(data.places) || data.places.length === 0) {
    fail(slug, 'places must be a non-empty list of { name, lat, lon }')
  }
  const places = data.places.map((place, index) => {
    const where = `places[${index}]`
    if (!place || typeof place !== 'object')
      fail(slug, `${where} is not a mapping`)
    const name = String(place.name ?? '').trim()
    if (!name) fail(slug, `${where} has no name`)
    if (name.includes(PART.trim()) || name.includes(LEG.trim())) {
      fail(slug, `${where} name "${name}" may not contain · or →`)
    }
    const lat = Number(place.lat)
    const lon = Number(place.lon)
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      fail(slug, `${where} ("${name}") has no usable lat`)
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      fail(slug, `${where} ("${name}") has no usable lon`)
    }
    return { name, lat, lon }
  })
  const seen = new Set()
  for (const place of places) {
    if (seen.has(place.name)) fail(slug, `places lists "${place.name}" twice`)
    seen.add(place.name)
  }

  const cover = data.cover == null ? null : String(data.cover)
  if (cover !== null) {
    if (!NAME.test(cover)) fail(slug, `cover "${cover}" is not a manifest name`)
    if (photoNames && !photoNames.includes(cover)) {
      fail(slug, `cover "${cover}" is not in the photo manifest`)
    }
  }

  return {
    title: String(data.title),
    date,
    end,
    precision,
    summary: String(data.summary),
    cover,
    places,
    draft: data.draft === true,
  }
}

/** `Day 8–9` → an anchor id. Keeps the label's numbers, drops the rest. */
function dayId(first, last) {
  return last === first ? `day-${first}` : `day-${first}-${last}`
}

/**
 * Splits a trip's body into days.
 *
 * A `##` heading is `Day <label> · <title> · <place>`. The label is a day
 * number or an ascending range; the place is one of the trip's places, or a
 * chain of them for a travel day (`Dubrovnik → Athens → Naxos`), in which
 * case the day belongs to where it ended. Image lines are lifted out of the
 * prose before markdown ever sees them: the processor has no `rehype-raw`,
 * so an image left in the body would reach the page as a bare `<img>` with
 * a manifest name for a src.
 *
 * @param {string} content The body after the frontmatter.
 * @param {object} trip
 * @param {string} trip.slug
 * @param {{name: string}[]} trip.places
 * @param {string} trip.date First day.
 * @param {string} trip.end Last day.
 * @param {string[]} [trip.photoNames] Manifest names; image lines are
 *   checked against it when given.
 * @param {Record<string, {kid?: boolean, publish?: boolean}>} [trip.photos]
 *   The manifest by name, for the kid check.
 * @returns {{id: string, label: string, first: number, last: number,
 *   title: string, place: string, legs: string[], markdown: string,
 *   photos: {name: string, alt: string, caption: string|null}[]}[]}
 */
export function parseTripDays(content, trip) {
  const { slug, places, date, end, photoNames, photos = {} } = trip
  const known = new Set(places.map((place) => place.name))
  const span = daySpan(date, end)
  const days = []
  let day = null
  let previousLast = 0

  const flushProse = () => {
    if (day) day.markdown = day.markdown.trim()
  }

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trimEnd()

    if (/^#{1,6}\s/.test(line)) {
      const heading = line.match(/^(#{1,6})\s+(.*)$/)
      const [, hashes, text] = heading
      if (hashes.length !== 2) {
        // ### and deeper belong to a day's prose; # is never a trip heading,
        // since the page's h1 is the trip title.
        if (hashes.length === 1)
          fail(slug, `a trip file has no "# " heading: ${line}`)
        if (!day) fail(slug, `heading before the first day: ${line}`)
        day.markdown += `${line}\n`
        continue
      }

      const parts = text.split(PART).map((part) => part.trim())
      if (parts.length !== 3) {
        fail(
          slug,
          `a day heading is "Day <n> · <title> · <place>", not: ${line}`,
        )
      }
      const [dayPart, title, placePart] = parts
      const labelMatch = dayPart.match(/^Day\s+(.*)$/)
      if (!labelMatch) fail(slug, `a day heading starts with "Day": ${line}`)
      const label = labelMatch[1].trim()
      const numbers = label.match(DAY_LABEL)
      if (!numbers) {
        fail(slug, `day label "${label}" is not a number or a range: ${line}`)
      }
      const first = Number(numbers[1])
      const last = numbers[2] == null ? first : Number(numbers[2])
      if (last < first) fail(slug, `day range "${label}" does not ascend`)
      if (first <= previousLast) {
        fail(slug, `day ${label} does not follow day ${previousLast}`)
      }
      if (last > span) {
        fail(
          slug,
          `day ${label} is past the trip's ${span} day${span === 1 ? '' : 's'}`,
        )
      }
      if (!title) fail(slug, `day ${label} has no title`)

      const legs = placePart.split(LEG).map((leg) => leg.trim())
      for (const leg of legs) {
        if (!known.has(leg)) {
          fail(slug, `day ${label} names a place not in places: "${leg}"`)
        }
      }

      flushProse()
      previousLast = last
      day = {
        id: dayId(first, last),
        label,
        first,
        last,
        title,
        place: legs[legs.length - 1],
        legs,
        markdown: '',
        photos: [],
      }
      days.push(day)
      continue
    }

    const image = line.trim().match(IMAGE_LINE)
    if (image) {
      if (!day) fail(slug, `a photo before the first day: ${line}`)
      const [, alt, name, doubleQuoted, singleQuoted] = image
      const caption = doubleQuoted ?? singleQuoted
      if (!alt.trim()) {
        fail(slug, `the photo "${name}" has no alt text (day ${day.label})`)
      }
      if (photoNames && !photoNames.includes(name)) {
        fail(slug, `the photo "${name}" is not in the photo manifest`)
      }
      const entry = photos[name]
      if (entry?.kid === true && entry.publish !== true) {
        fail(
          slug,
          `the photo "${name}" is marked kid: true without publish: true`,
        )
      }
      if (day.photos.some((photo) => photo.name === name)) {
        fail(slug, `day ${day.label} uses the photo "${name}" twice`)
      }
      day.photos.push({
        name,
        alt: alt.trim(),
        caption: caption?.trim() || null,
      })
      continue
    }

    if (line.trim().startsWith('![')) {
      fail(slug, `a photo line must be \`![alt](name "caption")\`: ${line}`)
    }

    if (!day) {
      if (line.trim()) fail(slug, `prose before the first day: ${line}`)
      continue
    }
    day.markdown += `${line}\n`
  }

  flushProse()
  if (days.length === 0)
    fail(slug, 'no days: a trip needs at least one "## Day" heading')
  for (const entry of days) {
    if (!entry.markdown) fail(slug, `day ${entry.label} has no prose`)
  }
  return days
}

/**
 * The dates a day covers, or null when the trip is not dated to the day.
 *
 * @param {{first: number, last: number}} day
 * @param {{date: string, precision: string}} trip
 * @returns {{from: string, to: string} | null}
 */
export function dayDates(day, trip) {
  if (trip.precision !== 'day') return null
  return {
    from: addDays(trip.date, day.first - 1),
    to: addDays(trip.date, day.last - 1),
  }
}

/**
 * Every manifest name a trip actually shows: its cover and each day's photo
 * lines, in that order, without repeats.
 *
 * The image build reads this rather than the whole manifest. The ingest
 * tool copies every photo from a dump into `photos/`, hundreds of which are
 * never meant to be published; building only what the trip file names means
 * a photo leaves the owner's machine because someone chose it, never
 * because it was in the folder.
 *
 * @param {{cover: string|null}} frontmatter
 * @param {{photos: {name: string}[]}[]} days
 * @returns {string[]}
 */
export function referencedPhotoNames(frontmatter, days) {
  const names = new Set()
  if (frontmatter.cover) names.add(frontmatter.cover)
  for (const day of days) {
    for (const photo of day.photos) names.add(photo.name)
  }
  return [...names]
}

/** The scaffold's placeholder, as a whole word, anywhere in the file. */
const TODO = /\bTODO\b/

/**
 * Refuses a published trip that still carries a scaffold placeholder.
 *
 * `scripts/ingest-photos.mjs` writes every day's prose as `TODO` and the
 * file as `draft: true`. A draft may hold as many as it likes; the moment
 * the draft flag comes off, a leftover `TODO` would be public copy, so the
 * build fails on it instead.
 *
 * @param {string} source The whole file, frontmatter included.
 * @param {string} slug
 * @param {boolean} draft
 */
export function assertNoPlaceholders(source, slug, draft) {
  if (draft) return
  const lines = source.split(/\r?\n/)
  const index = lines.findIndex((line) => TODO.test(line))
  if (index !== -1) {
    fail(
      slug,
      `line ${index + 1} still has a TODO, and the trip is not a draft: ` +
        lines[index].trim(),
    )
  }
}
