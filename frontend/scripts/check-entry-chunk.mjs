// Fails when the built entry chunk contains tailwind-merge (the `cn` package),
// which adds ~30KB raw to every page (#530). Run after `npm run build`:
//   node scripts/check-entry-chunk.mjs [dist]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Property names of the `cn` engine's tables; they survive minification. */
export const MARKERS = ['orderSensitiveModifiers', 'postfixLookupGroups']

/** The entry script's path in a built index.html, or null. */
export function entryChunkPath(html) {
  const m = html.match(/<script[^>]*\bsrc="(\/assets\/index-[\w-]+\.js)"/)
  return m ? m[1] : null
}

/** The markers found in a chunk's text. */
export function findMarkers(text) {
  return MARKERS.filter((marker) => text.includes(marker))
}

function main(dist) {
  const html = readFileSync(join(dist, 'index.html'), 'utf8')
  const path = entryChunkPath(html)
  if (!path) throw new Error(`no entry script in ${dist}/index.html`)
  const found = findMarkers(readFileSync(join(dist, path), 'utf8'))
  if (found.length > 0) {
    console.error(
      `${path} contains tailwind-merge (${found.join(', ')}): an eager file imports cn. See frontend/CLAUDE.md, "cx".`,
    )
    process.exit(1)
  }
  console.log(`${path}: no tailwind-merge`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv[2] ?? 'dist')
}
