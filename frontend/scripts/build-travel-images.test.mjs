import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import sharp from 'sharp'

import {
  WIDTHS,
  buildTripImages,
  isPublishable,
} from './build-travel-images.mjs'

let root
let tripsDir
let outDir

const SLUG = 'croatia-greece-2026'

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'travel-images-'))
  tripsDir = path.join(root, 'trips')
  outDir = path.join(root, 'public', 'travel')
  await fs.mkdir(path.join(tripsDir, SLUG, 'photos'), { recursive: true })
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

const photosDir = () => path.join(tripsDir, SLUG, 'photos')

/**
 * Writes a landscape source photo. `orientation` is the EXIF tag, so 6
 * means "rotate 90° clockwise to display", i.e. the photo is really
 * portrait — the case a strip without a rotate gets wrong.
 */
async function writeSource(
  file,
  { width = 2400, height = 1600, orientation } = {},
) {
  let image = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 40, g: 90, b: 140 },
    },
  }).jpeg()
  if (orientation != null) {
    // libvips keeps orientation apart from the rest of the EXIF block, so
    // an Orientation key inside withExif is overwritten with 1; it has to go
    // through withMetadata.
    image = image
      .withExif({ GPS: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' } })
      .withMetadata({ orientation })
  }
  await image.toFile(path.join(photosDir(), file))
}

async function writeManifest(photos) {
  await fs.writeFile(
    path.join(photosDir(), 'photos.json'),
    `${JSON.stringify(photos, null, 2)}\n`,
  )
}

const build = () => buildTripImages({ slug: SLUG, tripsDir, outDir })

const readManifest = async () =>
  JSON.parse(await fs.readFile(path.join(photosDir(), 'photos.json'), 'utf8'))

describe('buildTripImages', () => {
  it('writes both widths and records the large one in the manifest', async () => {
    await writeSource('walls.jpg')
    await writeManifest([{ name: 'walls-afternoon', file: 'walls.jpg' }])

    const { built } = await build()

    expect(built).toHaveLength(1)
    const dir = path.join(outDir, SLUG)
    expect((await fs.readdir(dir)).sort()).toEqual([
      'walls-afternoon-1600.webp',
      'walls-afternoon-800.webp',
    ])
    for (const width of WIDTHS) {
      const meta = await sharp(
        path.join(dir, `walls-afternoon-${width}.webp`),
      ).metadata()
      expect(meta.format).toBe('webp')
      expect(meta.width).toBe(width)
    }
    const [photo] = await readManifest()
    expect(photo).toMatchObject({ width: 1600, height: 1067 })
  })

  it('does not enlarge a photo smaller than the large width', async () => {
    await writeSource('small.jpg', { width: 1000, height: 667 })
    await writeManifest([{ name: 'small', file: 'small.jpg' }])

    await build()

    const meta = await sharp(
      path.join(outDir, SLUG, 'small-1600.webp'),
    ).metadata()
    expect(meta.width).toBe(1000)
    const [photo] = await readManifest()
    expect(photo.width).toBe(1000)
  })

  it('bakes in the EXIF orientation before stripping it', async () => {
    // Orientation 6 on a 2400×1600 file means it should display portrait.
    await writeSource('portrait.jpg', { orientation: 6 })
    await writeManifest([{ name: 'portrait', file: 'portrait.jpg' }])

    await build()

    const meta = await sharp(
      path.join(outDir, SLUG, 'portrait-1600.webp'),
    ).metadata()
    expect(meta.height).toBeGreaterThan(meta.width)
    const [photo] = await readManifest()
    expect(photo.height).toBeGreaterThan(photo.width)
  })

  it('strips every scrap of metadata, GPS above all', async () => {
    await writeSource('tagged.jpg', { orientation: 6 })
    await writeManifest([{ name: 'tagged', file: 'tagged.jpg' }])
    const sourceMeta = await sharp(
      path.join(photosDir(), 'tagged.jpg'),
    ).metadata()
    expect(sourceMeta.exif).toBeDefined()

    await build()

    for (const width of WIDTHS) {
      const file = path.join(outDir, SLUG, `tagged-${width}.webp`)
      const meta = await sharp(file).metadata()
      expect(meta.exif).toBeUndefined()
      expect(meta.orientation).toBeUndefined()
      // WebP carries metadata in named chunks; neither may be present.
      const bytes = await fs.readFile(file)
      expect(bytes.includes(Buffer.from('EXIF'))).toBe(false)
      expect(bytes.includes(Buffer.from('XMP '))).toBe(false)
    }
  })

  it('skips a kid photo without an explicit opt-in, and builds one with it', async () => {
    await writeSource('one.jpg')
    await writeSource('two.jpg')
    await writeManifest([
      { name: 'at-the-gate', file: 'one.jpg', kid: true },
      { name: 'on-the-ferry', file: 'two.jpg', kid: true, publish: true },
    ])

    const { built, skipped } = await build()

    expect(built.map((photo) => photo.name)).toEqual(['on-the-ferry'])
    expect(skipped.map((photo) => photo.name)).toEqual(['at-the-gate'])
    const written = await fs.readdir(path.join(outDir, SLUG))
    expect(written.some((file) => file.startsWith('at-the-gate'))).toBe(false)
  })

  it('refuses a manifest that is missing, malformed or self-contradictory', async () => {
    await expect(build()).rejects.toThrow(/no photo manifest at/)

    await writeManifest([{ name: 'Walls Afternoon', file: 'walls.jpg' }])
    await expect(build()).rejects.toThrow(/is not a usable photo name/)

    await writeManifest([
      { name: 'walls', file: 'walls.jpg' },
      { name: 'walls', file: 'other.jpg' },
    ])
    await expect(build()).rejects.toThrow(/lists "walls" twice/)

    await writeManifest([{ name: 'walls', file: '../../../etc/passwd' }])
    await expect(build()).rejects.toThrow(/must name a file in this folder/)

    await writeManifest([
      { name: 'walls', file: 'walls.jpg', confidence: 'vibes' },
    ])
    await expect(build()).rejects.toThrow(/expected exif, mtime, none/)
  })

  it('refuses a manifest entry with no source file', async () => {
    await writeManifest([{ name: 'walls', file: 'missing.jpg' }])
    await expect(build()).rejects.toThrow(/has no source file at/)
  })
})

describe('isPublishable', () => {
  it('is true for an ordinary photo and false only for an unopted kid photo', () => {
    expect(isPublishable({ name: 'walls' })).toBe(true)
    expect(isPublishable({ name: 'walls', kid: false })).toBe(true)
    expect(isPublishable({ name: 'walls', kid: true })).toBe(false)
    expect(isPublishable({ name: 'walls', kid: true, publish: true })).toBe(
      true,
    )
  })
})
