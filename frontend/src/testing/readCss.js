import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * The hand-written stylesheets in cascade order: what tailwind.css imports
 * into the `base` layer (#536). Tests that read the CSS as text go through
 * `readCss()` and not a file path, so moving a block between these files, or
 * deleting one, changes this list and nothing else.
 */
export const CSS_FILES = [
  'styles/tokens.css',
  'styles/base.css',
  'styles/post-body.css',
  'styles/print.css',
]

/**
 * The text of the hand-written CSS. Vitest stubs CSS imports, so tests read it
 * from disk.
 *
 * The shared utilities (`styles/utilities.css`) are not in `CSS_FILES`: they
 * are imported unlayered, as Tailwind `@utility` rules, and tests that read
 * the CSS as text read them as well.
 *
 * @param {string[]} [files] files under src/, in cascade order (all by default)
 * @returns {string}
 */
export function readCss(files = [...CSS_FILES, 'styles/utilities.css']) {
  return files
    .map((file) => readFileSync(join(here, '..', file), 'utf8'))
    .join('\n')
}
