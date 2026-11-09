/**
 * Resizes a trip's photos for the web, locally.
 *
 * Run by hand, never by `npm run build`:
 *
 *   node scripts/build-travel-images.mjs croatia-greece-2026
 *
 * Reads `trips/<slug>/photos/` and its `photos.json`, writes
 * `public/travel/<slug>/<name>-800.webp` and `-1600.webp`, and writes each
 * photo's emitted dimensions back into the manifest so the page can reserve
 * its space and the trip page has no layout shift.
 *
 * Why local and committed: Render's build would need sharp's native binary
 * and the originals, which are the one thing that must not enter git — a
 * blob with GPS in it is in the history forever. So the originals stay on
 * the owner's machine (gitignored), the output is committed, and the
 * deployed build only compiles markdown.
 *
 * Two things this script is responsible for, because nothing downstream can
 * recover them:
 *
 * - **Orientation.** sharp strips all metadata by default (keepMetadata()
 *   and withMetadata() are the opt-ins, and neither is called here), and
 *   that strip takes EXIF orientation with it. `.rotate()` with no argument
 *   bakes the orientation into the pixels first. Without it, a phone photo
 *   ships sideways.
 * - **The kid rule.** A photo marked `kid: true` is skipped unless it also
 *   carries `publish: true`. The grammar refuses one in a trip file as
 *   well; this is the half that keeps it from reaching public/ at all.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

/** The two widths the page's srcset offers. */
export const WIDTHS = [800, 1600]

/** Chosen for photographs, where 82 is visually clean at this size. */
const QUALITY = 82

/** A manifest name reaches a URL, so it is restricted by construction. */
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** How a photo's date was established. `none` means nobody knows yet. */
export const CONFIDENCES = ['exif', 'mtime', 'none']

class BuildError extends Error {}

function fail(message) {
  throw new BuildError(message)
}

/**
 * Reads and checks a trip's photo manifest.
 *
 * @param {string} file Path to photos.json.
 * @returns {Promise<object[]>}
 */
export async function readManifest(file) {
  let parsed
  try {
    parsed = JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') fail(`no photo manifest at ${file}`)
    fail(`${file} is not readable JSON: ${error.message}`)
  }
  if (!Array.isArray(parsed)) fail(`${file} must be a list of photos`)

  const seen = new Set()
  for (const photo of parsed) {
    const name = String(photo?.name ?? '')
    if (!NAME.test(name)) {
      fail(`"${name}" is not a usable photo name (lowercase, digits, hyphens)`)
    }
    if (seen.has(name)) fail(`the manifest lists "${name}" twice`)
    seen.add(name)
    if (!photo.file) fail(`the photo "${name}" has no file`)
    if (path.basename(String(photo.file)) !== String(photo.file)) {
      fail(`the photo "${name}" must name a file in this folder, not a path`)
    }
    if (photo.confidence != null && !CONFIDENCES.includes(photo.confidence)) {
      fail(
        `the photo "${name}" has confidence "${photo.confidence}"; expected ` +
          CONFIDENCES.join(', '),
      )
    }
  }
  return parsed
}

/** Whether this photo may be published at all. */
export function isPublishable(photo) {
  return photo.kid !== true || photo.publish === true
}

/**
 * Builds one photo at every width.
 *
 * @returns {Promise<{width: number, height: number, files: string[]}>} The
 *   largest output's dimensions, which is what the page reserves space for.
 */
async function buildPhoto({ source, outDir, name }) {
  const files = []
  let largest = null
  for (const width of WIDTHS) {
    const out = path.join(outDir, `${name}-${width}.webp`)
    // .rotate() before resize: it reads the EXIF orientation, which the
    // metadata strip below is about to throw away.
    const info = await sharp(source)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(out)
    files.push(path.basename(out))
    if (!largest || info.width > largest.width) {
      largest = { width: info.width, height: info.height }
    }
  }
  return { ...largest, files }
}

/**
 * Builds every publishable photo in a trip and rewrites its manifest.
 *
 * @param {object} input
 * @param {string} input.slug
 * @param {string} input.tripsDir Holding `<slug>/photos/`.
 * @param {string} input.outDir Holding `<slug>/` (public/travel).
 * @param {(line: string) => void} [input.log]
 * @returns {Promise<{built: object[], skipped: object[]}>}
 */
export async function buildTripImages({
  slug,
  tripsDir,
  outDir,
  log = () => {},
}) {
  if (!NAME.test(slug)) fail(`"${slug}" is not a usable trip slug`)
  const photosDir = path.join(tripsDir, slug, 'photos')
  const manifestFile = path.join(photosDir, 'photos.json')
  const manifest = await readManifest(manifestFile)
  const destination = path.join(outDir, slug)
  await fs.mkdir(destination, { recursive: true })

  const built = []
  const skipped = []
  for (const photo of manifest) {
    if (!isPublishable(photo)) {
      // Not an error: a kid photo may sit in the manifest unpublished for
      // as long as the owner likes. It just never leaves the folder.
      skipped.push(photo)
      log(`skipped ${photo.name} (kid: true without publish: true)`)
      continue
    }
    const source = path.join(photosDir, photo.file)
    try {
      await fs.access(source)
    } catch {
      fail(`the photo "${photo.name}" has no source file at ${source}`)
    }
    const { width, height, files } = await buildPhoto({
      source,
      outDir: destination,
      name: photo.name,
    })
    photo.width = width
    photo.height = height
    built.push(photo)
    log(`${photo.name} → ${files.join(', ')} (${width}×${height})`)
  }

  await fs.writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
  log(
    `${built.length} photo${built.length === 1 ? '' : 's'} built into ` +
      `${path.relative(process.cwd(), destination)}` +
      (skipped.length ? `, ${skipped.length} skipped` : ''),
  )
  return { built, skipped }
}

/** Whether this module was run directly rather than imported. */
function isEntryPoint() {
  return process.argv[1] === fileURLToPath(import.meta.url)
}

if (isEntryPoint()) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const slug = process.argv[2]
  if (!slug) {
    console.error('usage: node scripts/build-travel-images.mjs <trip-slug>')
    process.exit(2)
  }
  try {
    await buildTripImages({
      slug,
      tripsDir: path.join(root, 'trips'),
      outDir: path.join(root, 'public', 'travel'),
      log: (line) => console.log(line),
    })
  } catch (error) {
    console.error(error instanceof BuildError ? error.message : error)
    process.exit(1)
  }
}
