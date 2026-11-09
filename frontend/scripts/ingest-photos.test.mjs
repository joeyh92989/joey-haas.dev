import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import matter from 'gray-matter'
import sharp from 'sharp'

import {
  IngestError,
  PLACEHOLDER,
  assignNames,
  clusterByGap,
  formatReport,
  haversineKm,
  manifestFor,
  nearestPlace,
  parseArgs,
  parseExifTime,
  planTrip,
  readExif,
  readGazetteer,
  scanPhotos,
  writeTrip,
} from './ingest-photos.mjs'
import { parseTripDays, parseTripFrontmatter } from './trip-markdown.mjs'

const GAZETTEER = [
  { name: 'Dublin', country: 'Ireland', lat: 53.3498, lon: -6.2603 },
  { name: 'Galway', country: 'Ireland', lat: 53.2707, lon: -9.0568 },
  { name: 'Dingle', country: 'Ireland', lat: 52.1408, lon: -10.2689 },
]

const DUBLIN = { lat: 53.333, lon: -6.26 }
const GALWAY = { lat: 53.27, lon: -9.05 }

let root
let dump
let tripsDir

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ingest-photos-'))
  dump = path.join(root, 'dump')
  tripsDir = path.join(root, 'trips')
  await fs.mkdir(dump, { recursive: true })
  await fs.mkdir(tripsDir, { recursive: true })
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

/** A small JPEG, optionally with a camera time and a Dublin GPS fix. */
async function writePhoto(file, { taken, gps = false } = {}) {
  const exif = {}
  if (taken) exif.IFD2 = { DateTimeOriginal: taken }
  if (gps) {
    exif.IFD3 = {
      GPSLatitudeRef: 'N',
      GPSLatitude: '53/1 20/1 0/1',
      GPSLongitudeRef: 'W',
      GPSLongitude: '6/1 15/1 36/1',
    }
  }
  let image = sharp({
    create: { width: 64, height: 48, channels: 3, background: '#336699' },
  }).jpeg()
  if (Object.keys(exif).length) image = image.withExif(exif)
  const full = path.join(dump, file)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await image.toFile(full)
  return full
}

/** Backdates a file, so its mtime counts as old. */
async function age(file, isoDate) {
  const when = new Date(`${isoDate}T12:00:00`)
  await fs.utimes(file, when, when)
}

const photo = (date, extra = {}) => ({
  source: `/dump/${date}.jpg`,
  ext: '.jpg',
  date,
  time: '12:00',
  confidence: 'exif',
  gps: null,
  ...extra,
})

describe('parseExifTime', () => {
  it('reads the camera string and refuses an unset clock', () => {
    expect(parseExifTime('2014:06:03 14:22:01')).toEqual({
      date: '2014-06-03',
      time: '14:22',
    })
    expect(parseExifTime('0000:00:00 00:00:00')).toBeNull()
    expect(parseExifTime(null)).toBeNull()
    expect(parseExifTime('yesterday')).toBeNull()
  })
})

describe('readExif', () => {
  it('reads the capture time and GPS a camera wrote', async () => {
    const file = await writePhoto('a.jpg', {
      taken: '2014:06:03 14:22:01',
      gps: true,
    })
    const { taken, gps } = await readExif(file)
    expect(taken).toBe('2014:06:03 14:22:01')
    expect(gps.lat).toBeCloseTo(53.333, 2)
    expect(gps.lon).toBeCloseTo(-6.26, 2)
  })

  it('answers nulls for a photo without EXIF and for a file that is not one', async () => {
    const bare = await writePhoto('bare.jpg')
    expect(await readExif(bare)).toEqual({ taken: null, gps: null })
    const fake = path.join(dump, 'fake.jpg')
    await fs.writeFile(fake, 'not an image')
    expect(await readExif(fake)).toEqual({ taken: null, gps: null })
  })
})

describe('scanPhotos', () => {
  it('records how each date was known: camera, old file time, or not at all', async () => {
    await writePhoto('trip/camera.jpg', { taken: '2014:06:03 14:22:01' })
    const old = await writePhoto('trip/old.jpg')
    await age(old, '2014-06-04')
    await writePhoto('trip/fresh.jpg')
    await fs.writeFile(path.join(dump, 'trip', 'clip.mov'), 'video')
    await fs.writeFile(path.join(dump, '.DS_Store'), '')

    const { photos, ignored } = await scanPhotos(dump)

    const by = Object.fromEntries(
      photos.map((p) => [path.basename(p.source), p]),
    )
    expect(by['camera.jpg']).toMatchObject({
      date: '2014-06-03',
      time: '14:22',
      confidence: 'exif',
    })
    expect(by['old.jpg']).toMatchObject({
      date: '2014-06-04',
      confidence: 'mtime',
    })
    // Just copied: its mtime is today's, which says nothing about the trip.
    expect(by['fresh.jpg']).toMatchObject({ date: null, confidence: 'none' })
    expect(ignored.map((file) => path.basename(file))).toEqual(['clip.mov'])
  })

  it('refuses a folder that does not exist', async () => {
    await expect(scanPhotos(path.join(root, 'nope'))).rejects.toThrow(
      IngestError,
    )
  })
})

describe('clusterByGap', () => {
  it('starts a new trip after more than `gap` empty days and drops undated photos', () => {
    const clusters = clusterByGap(
      [
        photo('2014-06-05'),
        photo('2014-06-03'),
        photo('2014-06-08'), // two empty days (6, 7): same trip at gap 2
        photo('2014-06-12'), // three empty days: a new trip
        photo(null, { date: null, confidence: 'none' }),
      ],
      2,
    )
    expect(
      clusters.map(({ from, to, photos }) => [from, to, photos.length]),
    ).toEqual([
      ['2014-06-03', '2014-06-08', 3],
      ['2014-06-12', '2014-06-12', 1],
    ])
  })
})

describe('places', () => {
  it('measures great-circle distance', () => {
    expect(haversineKm(GAZETTEER[0], GAZETTEER[1])).toBeCloseTo(186, -1)
  })

  it('names the nearest place in range, and guesses nothing out of range', () => {
    expect(nearestPlace(DUBLIN, GAZETTEER).name).toBe('Dublin')
    expect(nearestPlace({ lat: 48.85, lon: 2.35 }, GAZETTEER)).toBeNull()
    expect(nearestPlace(null, GAZETTEER)).toBeNull()
  })

  it('reads the committed gazetteer, every entry usable', async () => {
    const places = await readGazetteer(
      path.join(import.meta.dirname, 'places.json'),
    )
    expect(places.length).toBeGreaterThan(100)
    expect(new Set(places.map((p) => p.name)).size).toBe(places.length)
  })
})

describe('planTrip', () => {
  it('gives each day its majority place, in route order, and a placeholder where none is known', () => {
    const [cluster] = clusterByGap([
      photo('2014-06-03', { gps: DUBLIN }),
      photo('2014-06-03', { gps: DUBLIN, time: '13:00' }),
      photo('2014-06-03', { gps: GALWAY, time: '18:00' }),
      photo('2014-06-04'),
      photo('2014-06-06', { gps: GALWAY, confidence: 'mtime' }),
    ])
    const plan = planTrip(cluster, GAZETTEER)
    expect(plan.days.map((d) => [d.number, d.place])).toEqual([
      [1, 'Dublin'],
      [2, PLACEHOLDER],
      [4, 'Galway'],
    ])
    expect(plan.places.map((p) => p.name)).toEqual([
      'Dublin',
      'Galway',
      PLACEHOLDER,
    ])
    expect(plan.unplaced).toHaveLength(1)
    expect(plan.allExif).toBe(false)
  })
})

describe('assignNames', () => {
  it('names by capture time, falls back to the filename, and never collides', () => {
    const named = assignNames([
      photo('2014-06-03', { time: '14:22' }),
      photo('2014-06-03', { time: '14:22' }),
      { source: '/dump/IMG_4411 (1).HEIC', date: null, time: null },
    ])
    expect(named.map((p) => p.name)).toEqual([
      '2014-06-03-1422',
      '2014-06-03-1422-2',
      'img-4411-1',
    ])
  })
})

describe('manifestFor', () => {
  it('never carries GPS', () => {
    const [entry] = manifestFor([
      { ...photo('2014-06-03', { gps: DUBLIN }), name: 'a' },
    ])
    expect(entry).toEqual({
      name: 'a',
      file: 'a.jpg',
      date: '2014-06-03',
      confidence: 'exif',
    })
  })
})

describe('writeTrip', () => {
  async function scanAndWrite(slug = 'ireland-2014') {
    const { photos } = await scanPhotos(dump)
    const [cluster] = clusterByGap(photos)
    return writeTrip({ slug, cluster, gazetteer: GAZETTEER, tripsDir })
  }

  it('copies the photos, writes a GPS-free manifest, and scaffolds a draft that parses', async () => {
    await writePhoto('a.jpg', { taken: '2014:06:03 14:22:01', gps: true })
    await writePhoto('b.jpg', { taken: '2014:06:04 09:10:00' })

    const { copied, tripFile } = await scanAndWrite()

    expect(copied).toHaveLength(2)
    const photosDir = path.join(tripsDir, 'ireland-2014', 'photos')
    expect((await fs.readdir(photosDir)).sort()).toEqual([
      '2014-06-03-1422.jpg',
      '2014-06-04-0910.jpg',
      'photos.json',
    ])
    const manifestText = await fs.readFile(
      path.join(photosDir, 'photos.json'),
      'utf8',
    )
    expect(manifestText).not.toMatch(/lat|lon|gps/i)

    const source = await fs.readFile(tripFile, 'utf8')
    const { data, content } = matter(source)
    expect(data.draft).toBe(true)
    const manifest = JSON.parse(manifestText)
    const photoNames = manifest.map((p) => p.name)
    const frontmatter = parseTripFrontmatter(data, 'ireland-2014', photoNames)
    const days = parseTripDays(content, {
      slug: 'ireland-2014',
      places: frontmatter.places,
      date: frontmatter.date,
      end: frontmatter.end,
      photoNames,
      photos: Object.fromEntries(manifest.map((p) => [p.name, p])),
    })
    expect(days).toHaveLength(2)
    expect(source).toMatch(/## Day 1 · TODO · Dublin/)
    expect(source).toMatch(/## Day 2 · TODO · TODO/)
    expect(source).toMatch(
      /photos from 2014-06-03: 2014-06-03-1422 \(14:22, exif\)/,
    )
  })

  it('flags file-time dates in the draft', async () => {
    await writePhoto('a.jpg', { taken: '2014:06:03 14:22:01' })
    const old = await writePhoto('b.jpg')
    await age(old, '2014-06-04')
    const { tripFile } = await scanAndWrite()
    expect(await fs.readFile(tripFile, 'utf8')).toMatch(
      /dates came from file times/,
    )
  })

  it('leaves out a HEIC it cannot convert, so the draft never names a missing file', async () => {
    await writePhoto('a.jpg', { taken: '2014:06:03 14:22:01' })
    const heic = path.join(dump, 'b.heic')
    await fs.copyFile(path.join(dump, 'a.jpg'), heic)
    const { photos } = await scanPhotos(dump)
    const [cluster] = clusterByGap(photos)

    const { copied, unconverted, tripFile } = await writeTrip({
      slug: 'ireland-2014',
      cluster,
      gazetteer: GAZETTEER,
      tripsDir,
      convert: async () => false,
    })

    expect(copied).toHaveLength(1)
    expect(unconverted.map((p) => path.basename(p.source))).toEqual(['b.heic'])
    expect(await fs.readFile(tripFile, 'utf8')).not.toMatch(/-2 \(/)
  })

  it('refuses to overwrite a trip that already exists, and a bad slug', async () => {
    await writePhoto('a.jpg', { taken: '2014:06:03 14:22:01' })
    await scanAndWrite()
    await expect(scanAndWrite()).rejects.toThrow(/already exists/)
    await expect(scanAndWrite('Ireland 2014')).rejects.toThrow(
      /not a usable slug/,
    )
  })
})

describe('formatReport', () => {
  it('summarises trips, places and undated photos without writing anything', async () => {
    const photos = [
      photo('2014-06-03', { gps: DUBLIN }),
      photo('2014-06-20', { gps: GALWAY, confidence: 'mtime' }),
      {
        ...photo(null),
        date: null,
        time: null,
        confidence: 'none',
        source: '/dump/x.jpg',
      },
    ]
    const clusters = clusterByGap(photos)
    const text = formatReport({
      photos,
      ignored: ['/dump/clip.mov'],
      clusters,
      gazetteer: GAZETTEER,
      radiusKm: 40,
    }).join('\n')
    expect(text).toMatch(
      /3 photos \(1 dated by the camera, 1 by file time only, 1 undated\); 1 other file ignored/,
    )
    expect(text).toMatch(/Trip 1: 2014-06-03 to 2014-06-03/)
    expect(text).toMatch(
      /Trip 2: .*\n {2}places: Galway\n {2}dated from file times on: 2014-06-20/,
    )
    expect(text).toMatch(/Undated, in no trip \(1\):\n {2}\/dump\/x\.jpg/)
    expect(text).toMatch(/--trip <n>/)
  })
})

describe('parseArgs', () => {
  it('defaults to a dry run and checks what --write needs', () => {
    expect(parseArgs(['--from', 'x'])).toMatchObject({
      from: 'x',
      write: false,
      gap: 2,
    })
    expect(
      parseArgs(['--from', 'x', '--gap', '4', '--trip', '2']),
    ).toMatchObject({
      gap: 4,
      trip: 2,
    })
    expect(() => parseArgs([])).toThrow(/--from/)
    expect(() => parseArgs(['--from', 'x', '--write'])).toThrow(/--slug/)
    expect(() => parseArgs(['--from', 'x', '--gap', 'lots'])).toThrow(/number/)
    expect(() => parseArgs(['--from', 'x', '--bogus'])).toThrow(
      /unknown option/,
    )
  })
})
