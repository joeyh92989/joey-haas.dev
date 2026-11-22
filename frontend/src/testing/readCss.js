import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * The hand-written stylesheets in cascade order: what tailwind.css imports
 * into the legacy layer (#536). Tests that read the CSS as text go through
 * `readCss()` and not a file path, so moving a block between these files, or
 * deleting one, changes this list and nothing else.
 */
export const CSS_FILES = [
  'styles/tokens.css',
  'styles/base.css',
  'index.css',
  'styles/post-body.css',
  'styles/print.css',
]

/**
 * The text of the hand-written CSS. Vitest stubs CSS imports, so tests read it
 * from disk.
 *
 * @param {string[]} [files] files under src/, in cascade order (all by default)
 * @returns {string}
 */
export function readCss(files = CSS_FILES) {
  return files
    .map((file) => readFileSync(join(here, '..', file), 'utf8'))
    .join('\n')
}
