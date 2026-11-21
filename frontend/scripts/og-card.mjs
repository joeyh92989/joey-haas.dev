/**
 * Per-page link-preview cards: a 1200x630 PNG with the page's title, its
 * kind and date, in the site's own colors and self-hosted faces.
 *
 * Text is drawn as glyph outlines read from the @fontsource files with
 * opentype.js, not as SVG <text>: sharp's librsvg finds fonts through the
 * machine's fontconfig and ignores `fontfile` for web fonts, so a card would
 * come out in whatever the build host has. Outlines are the same on every
 * machine, and give real advance widths for the wrap.
 *
 * Everything but `loadFaces` and `renderCardPng` is pure and takes a `faces`
 * object ({width(face, text, size), path(face, text, x, y, size)}).
 * The colors are the light (paper and ink) tokens from index.css, so a link
 * preview matches the site (#529; og-card.test.mjs holds them to index.css and
 * measures their ratios on `--bg`).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const CARD = { width: 1200, height: 630 }
export const COLORS = {
  bg: '#f1ede6',
  text: '#231f1a',
  text2: '#57534d',
  accent: '#a8321f',
}

const MARGIN = 80
const TEXT_WIDTH = CARD.width - 2 * MARGIN
const TITLE = { size: 68, line: 82, first: 265, maxLines: 4 }
const KIND_LABEL = { blog: 'Blog', til: 'TIL', travel: 'Travel' }

/** XML text: the five entities. Curly quotes and other text pass as is. */
export function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Greedy word wrap on measured width, at most `maxLines`. A title that does
 * not fit ends its last line in an ellipsis; a word wider than a line is cut.
 * @param {string} title
 * @param {(text: string) => number} measure width of a string at title size
 * @returns {string[]}
 */
export function wrapTitle(
  title,
  measure,
  { width = TEXT_WIDTH, maxLines = TITLE.maxLines } = {},
) {
  const ellipsize = (text) => {
    let cut = text.replace(/[.,;:!?\s]+$/, '')
    while (cut.length > 1 && measure(`${cut}…`) > width) cut = cut.slice(0, -1)
    return `${cut}…`
  }
  const fit = (text) => (measure(text) <= width ? text : ellipsize(text))
  const words = String(title).split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''
  let overflow = false
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (measure(next) <= width) {
      current = next
      continue
    }
    if (current) lines.push(current)
    if (lines.length === maxLines) {
      overflow = true
      current = ''
      break
    }
    current = fit(word)
  }
  if (current) lines.push(current)
  if (overflow) lines[maxLines - 1] = ellipsize(lines[maxLines - 1])
  return lines
}

/** @param {{title: string, kind: string, date?: string}} card */
export function cardSvg({ title, kind, date }, faces) {
  const lines = wrapTitle(title, (text) =>
    faces.width('serif', text, TITLE.size),
  )
  const fill = (color, d) => `<path fill="${color}" d="${d}"/>`
  const parts = [
    `<rect width="${CARD.width}" height="${CARD.height}" fill="${COLORS.bg}"/>`,
    `<rect x="${MARGIN}" y="80" width="64" height="6" fill="${COLORS.accent}"/>`,
    fill(
      COLORS.accent,
      faces.path('sansBold', 'joey-haas.dev', MARGIN, 140, 32),
    ),
    ...lines.map((line, i) =>
      fill(
        COLORS.text,
        faces.path(
          'serif',
          line,
          MARGIN,
          TITLE.first + i * TITLE.line,
          TITLE.size,
        ),
      ),
    ),
  ]
  const meta = [KIND_LABEL[kind] ?? kind, date].filter(Boolean).join(' · ')
  parts.push(fill(COLORS.text2, faces.path('sans', meta, MARGIN, 590, 30)))
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}">` +
    `<title>${escapeXml(title)}</title>${parts.join('')}</svg>`
  )
}

const here = path.dirname(fileURLToPath(import.meta.url))
const FACE_FILES = {
  serif: 'source-serif-4/files/source-serif-4-latin-600-normal.woff',
  sans: 'inter/files/inter-latin-500-normal.woff',
  sansBold: 'inter/files/inter-latin-600-normal.woff',
}

/** Reads the self-hosted faces once. @returns {Promise<object>} faces */
export async function loadFaces() {
  const opentype = (await import('opentype.js')).default
  const fonts = {}
  for (const [name, file] of Object.entries(FACE_FILES)) {
    const buffer = await fs.readFile(
      path.join(here, '..', 'node_modules', '@fontsource', file),
    )
    fonts[name] = opentype.parse(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length),
    )
  }
  return {
    width: (face, text, size) => fonts[face].getAdvanceWidth(text, size),
    path: (face, text, x, y, size) =>
      fonts[face].getPath(text, x, y, size).toPathData(2),
  }
}

/** @returns {Promise<Buffer>} the card as a PNG */
export async function renderCardPng(card, faces) {
  const sharp = (await import('sharp')).default
  return sharp(Buffer.from(cardSvg(card, faces)))
    .png({ compressionLevel: 9 })
    .toBuffer()
}
