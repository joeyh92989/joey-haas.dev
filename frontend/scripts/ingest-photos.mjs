/**
 * Turns a dump of photos into candidate trips, and one of them into a draft.
 *
 * Run by hand, from frontend/:
 *
 *   node scripts/ingest-photos.mjs --from ~/Desktop/ireland-dump
 *   node scripts/ingest-photos.mjs --from ~/Desktop/ireland-dump \
 *     --write --slug ireland-2014 [--trip 2]
 *
 * The first form is a dry run and writes nothing: it reads every image's
 * date and GPS, groups them into trips by the gaps between dates, names the
 * places it can, and prints a report. The second copies one trip's photos
 * into the gitignored `trips/<slug>/photos/`, writes their manifest, and
 * scaffolds `trips/<slug>.md` as a draft for a person to finish.
 *
 * Three rules hold everywhere in here, because the point of the tool is a
 * travel history that is true:
 *
 * - **A date is recorded with how it was known, never invented.** `exif`
 *   when the camera wrote it, `mtime` when only the file's modified time
 *   says so, `none` when neither can be trusted. A file modified in the
 *   last `freshDays` days was almost certainly just copied or downloaded,
 *   so its mtime is today's, not the trip's; it gets `none`.
 * - **No GPS, no guess.** A place is named only when a photo's GPS falls
 *   within `radiusKm` of a gazetteer entry. Anything else is written as the
 *   placeholder place `TODO`, which parses, so the draft still renders in
 *   the dev server, and which the site build refuses once the trip stops
 *   being a draft.
 * - **Nothing leaves the machine, and GPS never enters git.** The
 *   gazetteer is a committed file, the copies land in a gitignored folder,
 *   and the committed manifest carries a name, a file, a day and a
 *   confidence — no coordinates.
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import exifr from 'exifr'

import { daySpan } from './trip-markdown.mjs'

/** The tuning points, each a flag on the CLI. */
export const DEFAULTS = { gap: 2, freshDays: 30, radiusKm: 40 }

/** What the tool will try to read as a photo. Everything else is counted. */
const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.heic',
  '.heif',
  '.webp',
  '.tif',
  '.tiff',
])

/** sharp cannot read these on a stock build, so they are converted first. */
const HEIC_EXTENSIONS = new Set(['.heic', '.heif'])

/** The scaffold's stand-in for anything a person has to supply. */
export const PLACEHOLDER = 'TODO'

const DAY_MS = 24 * 60 * 60 * 1000

export class IngestError extends Error {}

function fail(message) {
  throw new IngestError(message)
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

/**
 * Reads one image's capture time and GPS. A file with no EXIF answers
 * nulls; a file exifr cannot parse at all answers nulls too, since the
 * report already counts what could not be dated.
 *
 * `reviveValues: false` keeps the capture time as the camera's own
 * `YYYY:MM:DD HH:MM:SS` string. Revived, it becomes a Date in the machine's
 * timezone, and a photo taken at 11pm in Athens could move a day.
 */
export async function readExif(file) {
  let taken = null
  let gps = null
  try {
    const tags = await exifr.parse(file, {
      pick: ['DateTimeOriginal', 'CreateDate'],
      reviveValues: false,
    })
    taken = tags?.DateTimeOriginal ?? tags?.CreateDate ?? null
  } catch {
    // Not an image exifr can read: undated, and the report says so.
  }
  try {
    const position = await exifr.gps(file)
    if (
      Number.isFinite(position?.latitude) &&
      Number.isFinite(position?.longitude)
    ) {
      gps = { lat: position.latitude, lon: position.longitude }
    }
  } catch {
    // No readable GPS: the photo is simply not placed.
  }
  return { taken: typeof taken === 'string' ? taken : null, gps }
}

/** `2014:06:03 14:22:01` → `{date: '2014-06-03', time: '14:22'}`, or null. */
export function parseExifTime(value) {
  const match = String(value ?? '').match(
    /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})/,
  )
  if (!match) return null
  const [, year, month, day, hour, minute] = match
  // Cameras with an unset clock write 0000:00:00; that is no date at all.
  if (year === '0000' || month === '00' || day === '00') return null
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` }
}

/** A Date as the machine's local `{date, time}`. */
function localStamp(when) {
  const pad = (value) => String(value).padStart(2, '0')
  return {
    date: `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`,
    time: `${pad(when.getHours())}:${pad(when.getMinutes())}`,
  }
}

/** Every file under `dir`, depth first, skipping dotfiles and dot-folders. */
async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(full)))
    else if (entry.isFile()) files.push(full)
  }
  return files
}

/**
 * Reads every photo in a dump.
 *
 * @param {string} dir
 * @param {object} [options]
 * @param {(file: string) => Promise<{taken: string|null, gps: object|null}>} [options.read]
 * @param {Date} [options.now]
 * @param {number} [options.freshDays]
 * @returns {Promise<{photos: object[], ignored: string[]}>} `photos` carry
 *   `source`, `ext`, `date`, `time`, `confidence` and `gps`; `ignored` is
 *   every file that is not an image (videos, sidecars, documents).
 */
export async function scanPhotos(
  dir,
  { read = readExif, now = new Date(), freshDays = DEFAULTS.freshDays } = {},
) {
  try {
    const stat = await fs.stat(dir)
    if (!stat.isDirectory()) fail(`${dir} is not a folder`)
  } catch (error) {
    if (error instanceof IngestError) throw error
    fail(`no folder at ${dir}`)
  }

  const photos = []
  const ignored = []
  for (const source of await walk(dir)) {
    const ext = path.extname(source).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(ext)) {
      ignored.push(source)
      continue
    }
    const { taken, gps } = await read(source)
    const fromCamera = parseExifTime(taken)
    let stamp = null
    let confidence = 'none'
    if (fromCamera) {
      stamp = fromCamera
      confidence = 'exif'
    } else {
      const { mtime } = await fs.stat(source)
      if (now.getTime() - mtime.getTime() > freshDays * DAY_MS) {
        stamp = localStamp(mtime)
        confidence = 'mtime'
      }
    }
    photos.push({
      source,
      ext,
      date: stamp?.date ?? null,
      time: stamp?.time ?? null,
      confidence,
      gps,
    })
  }
  return { photos, ignored }
}

/* ------------------------------------------------------------------ */
/* Grouping and placing                                                */
/* ------------------------------------------------------------------ */

/**
 * Groups dated photos into candidate trips: sorted by date and time, a gap
 * of more than `gap` whole days starts a new one. Undated photos belong to
 * no trip.
 *
 * @returns {{from: string, to: string, photos: object[]}[]}
 */
export function clusterByGap(photos, gap = DEFAULTS.gap) {
  const dated = photos
    .filter((photo) => photo.date)
    .sort((a, b) =>
      `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`),
    )
  const clusters = []
  for (const photo of dated) {
    const current = clusters.at(-1)
    // daySpan counts both ends, so the days strictly between are span - 2.
    if (current && daySpan(current.to, photo.date) - 2 <= gap) {
      current.photos.push(photo)
      current.to = photo.date
    } else {
      clusters.push({ from: photo.date, to: photo.date, photos: [photo] })
    }
  }
  return clusters
}

/** Great-circle distance in kilometres. */
export function haversineKm(a, b) {
  const radians = (degrees) => (degrees * Math.PI) / 180
  const dLat = radians(b.lat - a.lat)
  const dLon = radians(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) *
      Math.cos(radians(b.lat)) *
      Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/**
 * The gazetteer place nearest a GPS fix, or null when none is within
 * `radiusKm`. A null is not a failure: it is the "no guess" rule.
 */
export function nearestPlace(gps, gazetteer, radiusKm = DEFAULTS.radiusKm) {
  if (!gps) return null
  let best = null
  for (const place of gazetteer) {
    const distance = haversineKm(gps, place)
    if (distance <= radiusKm && (!best || distance < best.distance)) {
      best = { place, distance }
    }
  }
  return best?.place ?? null
}

/** Reads and checks the committed gazetteer. */
export async function readGazetteer(file) {
  const parsed = JSON.parse(await fs.readFile(file, 'utf8'))
  if (!Array.isArray(parsed)) fail(`${file} must be a list of places`)
  for (const place of parsed) {
    if (
      !place?.name ||
      /[·→]/.test(place.name) ||
      !Number.isFinite(place.lat) ||
      !Number.isFinite(place.lon)
    ) {
      fail(`${file} has an unusable place: ${JSON.stringify(place)}`)
    }
  }
  return parsed
}

/**
 * Lays one candidate trip out as days.
 *
 * A day's place is the place most of that day's placed photos agree on;
 * a day none of them place is the placeholder. Places are listed in the
 * order the trip reached them, which is the order the map draws the route.
 *
 * @returns {{date: string, end: string, places: object[], days: object[],
 *   unplaced: object[], allExif: boolean}}
 */
export function planTrip(cluster, gazetteer, radiusKm = DEFAULTS.radiusKm) {
  const byDate = new Map()
  for (const photo of cluster.photos) {
    if (!byDate.has(photo.date)) byDate.set(photo.date, [])
    byDate.get(photo.date).push(photo)
  }

  const places = []
  const unplaced = []
  const days = []
  for (const [date, photos] of byDate) {
    const counts = new Map()
    for (const photo of photos) {
      const place = nearestPlace(photo.gps, gazetteer, radiusKm)
      photo.place = place?.name ?? null
      if (place) counts.set(place, (counts.get(place) ?? 0) + 1)
      else unplaced.push(photo)
    }
    let place = null
    for (const [candidate, count] of counts) {
      if (!place || count > counts.get(place)) place = candidate
    }
    if (place && !places.includes(place)) places.push(place)
    days.push({
      number: daySpan(cluster.from, date),
      date,
      place: place?.name ?? PLACEHOLDER,
      photos,
    })
  }

  const needsPlaceholder = days.some((day) => day.place === PLACEHOLDER)
  return {
    date: cluster.from,
    end: cluster.to,
    places: [
      ...places.map(({ name, lat, lon }) => ({ name, lat, lon })),
      ...(needsPlaceholder ? [{ name: PLACEHOLDER, lat: 0, lon: 0 }] : []),
    ],
    days,
    unplaced,
    allExif: cluster.photos.every((photo) => photo.confidence === 'exif'),
  }
}

/* ------------------------------------------------------------------ */
/* Naming and writing                                                  */
/* ------------------------------------------------------------------ */

/** Lowercase letters, digits and single hyphens: the manifest's NAME rule. */
function slugify(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Gives each photo a manifest name: its capture day and time when known
 * (`2014-06-03-1422`), its own filename otherwise, with `-2`, `-3` on a
 * clash. Camera names like IMG_4411 say nothing and collide across phones.
 */
export function assignNames(photos) {
  const used = new Set()
  for (const photo of photos) {
    const base =
      (photo.date && photo.time
        ? `${photo.date}-${photo.time.replace(':', '')}`
        : slugify(path.basename(photo.source, path.extname(photo.source)))) ||
      'photo'
    let name = base
    for (let n = 2; used.has(name); n += 1) name = `${base}-${n}`
    used.add(name)
    photo.name = name
  }
  return photos
}

/** A YAML double-quoted scalar. */
const quote = (text) => JSON.stringify(String(text))

/**
 * The draft trip file. Every field a person has to write is the
 * placeholder; each day lists its photos in a comment to pick from, since
 * an image line in a comment would still be read by the grammar.
 */
export function scaffoldMarkdown(plan) {
  const lines = [
    '---',
    `title: ${PLACEHOLDER}`,
    `date: ${plan.date}`,
    `end: ${plan.end}`,
  ]
  if (!plan.allExif) {
    lines.push(
      '# Some dates came from file times, not the camera. Check them; if the',
      '# days cannot be pinned down, say so with precision: month or year.',
    )
  }
  lines.push(
    'precision: day',
    `summary: ${PLACEHOLDER}`,
    '# cover: <a photo name from below>',
    'places:',
    ...plan.places.map(
      (place) =>
        `  - { name: ${quote(place.name)}, lat: ${place.lat}, lon: ${place.lon} }`,
    ),
    'draft: true',
    '---',
    '',
  )
  for (const day of plan.days) {
    const picks = day.photos
      .map((photo) =>
        photo.time
          ? `${photo.name} (${photo.time}, ${photo.confidence})`
          : `${photo.name} (${photo.confidence})`,
      )
      .join(', ')
    lines.push(
      `## Day ${day.number} · ${PLACEHOLDER} · ${day.place}`,
      '',
      PLACEHOLDER,
      '',
      `<!-- photos from ${day.date}: ${picks} -->`,
      '',
    )
  }
  return lines.join('\n')
}

/** The manifest the image build reads: no GPS, ever. */
export function manifestFor(photos) {
  return photos.map((photo) => ({
    name: photo.name,
    file: `${photo.name}${photo.outExt ?? photo.ext}`,
    date: photo.date,
    confidence: photo.confidence,
  }))
}

const execFileAsync = promisify(execFile)

/**
 * Converts a HEIC to JPEG with macOS's own `sips`, since sharp's prebuilt
 * binary has no HEVC decoder. Elsewhere there is no converter, and the
 * caller reports the photo instead.
 */
export async function convertHeic(source, destination) {
  if (process.platform !== 'darwin') return false
  await execFileAsync('sips', [
    '-s',
    'format',
    'jpeg',
    source,
    '--out',
    destination,
  ])
  return true
}

/**
 * Writes one candidate trip: copies (or converts) its photos into the
 * gitignored photos folder, writes the manifest and the draft. Refuses to
 * touch a trip that already exists, so a second run cannot overwrite prose,
 * and a photos folder that already holds anything, so it cannot overwrite
 * an original (the only copy, once the phone's is deleted) either.
 *
 * @returns {Promise<{copied: object[], unconverted: object[], tripFile: string}>}
 */
export async function writeTrip({
  slug,
  cluster,
  gazetteer,
  tripsDir,
  radiusKm = DEFAULTS.radiusKm,
  convert = convertHeic,
}) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    fail(`"${slug}" is not a usable slug (lowercase letters, digits, hyphens)`)
  }
  const tripFile = path.join(tripsDir, `${slug}.md`)
  const photosDir = path.join(tripsDir, slug, 'photos')
  const manifestFile = path.join(photosDir, 'photos.json')
  for (const existing of [tripFile, manifestFile]) {
    try {
      await fs.access(existing)
      fail(`${existing} already exists; move it aside to scaffold again`)
    } catch (error) {
      if (error instanceof IngestError) throw error
    }
  }
  const already = await fs.readdir(photosDir).catch((error) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  if (already.some((name) => !name.startsWith('.'))) {
    fail(`${photosDir} already holds files; move them aside to scaffold again`)
  }

  await fs.mkdir(photosDir, { recursive: true })
  assignNames(cluster.photos)
  const copied = []
  const unconverted = []
  for (const photo of cluster.photos) {
    if (HEIC_EXTENSIONS.has(photo.ext)) {
      const out = path.join(photosDir, `${photo.name}.jpg`)
      if (await convert(photo.source, out)) {
        photo.outExt = '.jpg'
        copied.push(photo)
      } else {
        unconverted.push(photo)
      }
      continue
    }
    // EXCL as well: two sources can never share a name (assignNames), but
    // an original is not the place to find out.
    await fs.copyFile(
      photo.source,
      path.join(photosDir, `${photo.name}${photo.ext}`),
      fs.constants.COPYFILE_EXCL,
    )
    copied.push(photo)
  }

  // A photo that could not be converted is left out of the day lists too,
  // so the draft never offers a name the image build has no file for.
  const kept = { ...cluster, photos: copied }
  const plan = planTrip(kept, gazetteer, radiusKm)
  await fs.writeFile(
    manifestFile,
    `${JSON.stringify(manifestFor(copied), null, 2)}\n`,
  )
  await fs.writeFile(tripFile, scaffoldMarkdown(plan))
  return { copied, unconverted, tripFile, plan }
}

/* ------------------------------------------------------------------ */
/* Reporting                                                           */
/* ------------------------------------------------------------------ */

/** `1 photo`, `3 photos`. */
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The dry run's report, as lines. */
export function formatReport({
  photos,
  ignored,
  clusters,
  gazetteer,
  radiusKm,
}) {
  const lines = []
  const counts = { exif: 0, mtime: 0, none: 0 }
  for (const photo of photos) counts[photo.confidence] += 1
  lines.push(
    `${count(photos.length, 'photo')} (${counts.exif} dated by the camera, ` +
      `${counts.mtime} by file time only, ${counts.none} undated); ` +
      `${count(ignored.length, 'other file')} ignored`,
    '',
  )
  clusters.forEach((cluster, index) => {
    const plan = planTrip(cluster, gazetteer, radiusKm)
    const span = daySpan(cluster.from, cluster.to)
    const named = plan.places
      .filter((place) => place.name !== PLACEHOLDER)
      .map((place) => place.name)
    const guessed = plan.days.filter((day) =>
      day.photos.some((photo) => photo.confidence !== 'exif'),
    )
    lines.push(
      `Trip ${index + 1}: ${cluster.from} to ${cluster.to} ` +
        `(${count(span, 'day')}, ${count(cluster.photos.length, 'photo')})`,
      `  places: ${named.length ? named.join(' → ') : 'none named'}`,
    )
    if (plan.unplaced.length) {
      lines.push(
        `  ${count(plan.unplaced.length, 'photo')} could not be placed`,
      )
    }
    if (guessed.length) {
      lines.push(
        `  dated from file times on: ${guessed.map((day) => day.date).join(', ')}`,
      )
    }
    lines.push('')
  })
  const undated = photos.filter((photo) => !photo.date)
  if (undated.length) {
    lines.push(`Undated, in no trip (${undated.length}):`)
    for (const photo of undated) lines.push(`  ${photo.source}`)
    lines.push('')
  }
  lines.push(
    clusters.length
      ? 'Nothing written. Add --write --slug <slug>' +
          (clusters.length > 1 ? ' --trip <n>' : '') +
          ' to scaffold a draft.'
      : 'Nothing written: no dated photos to make a trip from.',
  )
  return lines
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

/** Parses argv into options, refusing anything it does not know. */
export function parseArgs(argv) {
  const options = { ...DEFAULTS, write: false }
  const numbers = {
    '--gap': 'gap',
    '--fresh-days': 'freshDays',
    '--radius-km': 'radiusKm',
    '--trip': 'trip',
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--write') options.write = true
    else if (arg === '--dry-run') options.write = false
    else if (arg === '--from') options.from = argv[(i += 1)]
    else if (arg === '--slug') options.slug = argv[(i += 1)]
    else if (arg in numbers) {
      const value = Number(argv[(i += 1)])
      if (!Number.isFinite(value) || value < 0) fail(`${arg} needs a number`)
      options[numbers[arg]] = value
    } else fail(`unknown option ${arg}`)
  }
  if (!options.from) fail('--from <folder> is required')
  if (options.write && !options.slug) fail('--write needs --slug <slug>')
  return options
}

async function main(argv) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const options = parseArgs(argv)
  const gazetteer = await readGazetteer(
    path.join(root, 'scripts', 'places.json'),
  )
  const { photos, ignored } = await scanPhotos(path.resolve(options.from), {
    freshDays: options.freshDays,
  })
  const clusters = clusterByGap(photos, options.gap)

  if (!options.write) {
    for (const line of formatReport({
      photos,
      ignored,
      clusters,
      gazetteer,
      radiusKm: options.radiusKm,
    })) {
      console.log(line)
    }
    return
  }

  if (!clusters.length) fail('no dated photos to make a trip from')
  if (clusters.length > 1 && options.trip == null) {
    fail(`the folder holds ${clusters.length} trips; pick one with --trip <n>`)
  }
  const cluster = clusters[(options.trip ?? 1) - 1]
  if (!cluster)
    fail(
      `there is no trip ${options.trip}; the report lists 1 to ${clusters.length}`,
    )

  const { copied, unconverted, tripFile } = await writeTrip({
    slug: options.slug,
    cluster,
    gazetteer,
    tripsDir: path.join(root, 'trips'),
    radiusKm: options.radiusKm,
  })
  console.log(
    `${count(copied.length, 'photo')} copied into trips/${options.slug}/photos/`,
  )
  for (const photo of unconverted) {
    console.log(`  not converted (needs macOS sips): ${photo.source}`)
  }
  console.log(`draft written: ${path.relative(root, tripFile)}`)
  console.log(
    'Next: write each day, pick photos onto image lines, then run ' +
      `node scripts/build-travel-images.mjs ${options.slug}`,
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof IngestError ? error.message : error)
    process.exit(1)
  }
}
