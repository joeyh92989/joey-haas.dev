// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Source is read from disk. These are the shared-component rules in
// docs/design-system.md, held by a scan rather than by review.
const SRC = dirname(fileURLToPath(import.meta.url))

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path)
    return /\.jsx$/.test(entry.name) && !/\.test\./.test(entry.name)
      ? [path]
      : []
  })
}

const files = walk(SRC).map((path) => ({
  name: relative(SRC, path),
  text: readFileSync(path, 'utf8'),
}))

function offenders(test) {
  return files.filter((file) => test(file)).map((file) => file.name)
}

/** h1s written by hand: the shared headers, the gaps in the design doc's
 *  "Not yet migrated" table, and prose pages (see "Prose pages"). */
const H1_ALLOWED = new Set([
  'components/PageHeader.jsx',
  'components/AdminPageHeader.jsx',
  // Prose pages
  'pages/Home.jsx',
  'pages/About.jsx',
  'pages/Projects.jsx',
  'pages/Now.jsx',
  'pages/Colophon.jsx',
  'pages/Blog.jsx',
  'pages/Til.jsx',
  'pages/NotFound.jsx',
  // Not yet migrated
  'pages/Next.jsx',
  'pages/YearInReview.jsx',
  'pages/Daily.jsx',
  'pages/HowItWorks.jsx',
  'pages/Item.jsx',
  'pages/ComicIssue.jsx',
  'pages/ComicVolume.jsx',
  'layouts/AdminLayout.jsx',
  'components/RouteErrorBoundary.jsx',
])

/** Decorative `-empty` class names that are not an empty state. */
const EMPTY_DECORATION = ['candidate-thumb-empty', 'favourite-empty']

describe('shared component rules', () => {
  it('prints no bare LOAD_ERROR child: a failed read uses LoadState', () => {
    expect(offenders((f) => f.text.includes('{LOAD_ERROR}'))).toEqual([])
  })

  it('gives every admin-error element a role', () => {
    const bare = offenders((f) =>
      [
        ...f.text.matchAll(
          /<\w+[^<>]*className="[^"]*admin-error[^"]*"[^<>]*>/g,
        ),
      ]
        .map((m) => m[0])
        .some((tag) => !/\brole=/.test(tag)),
    )
    expect(bare).toEqual([])
  })

  it('has no role="dialog" outside Sheet', () => {
    expect(
      offenders(
        (f) =>
          f.text.includes('role="dialog"') && f.name !== 'components/Sheet.jsx',
      ),
    ).toEqual([])
  })

  it('writes no h1 outside PageHeader, the prose pages and the listed gaps', () => {
    expect(
      offenders((f) => /<h1[\s>]/.test(f.text) && !H1_ALLOWED.has(f.name)),
    ).toEqual([])
  })

  it('draws no empty state of its own: no *-empty class outside EmptyState', () => {
    const own = offenders((f) =>
      [...f.text.matchAll(/className=["'{`][^>]*?([\w-]*-empty\b)/g)].some(
        (m) =>
          !EMPTY_DECORATION.includes(m[1]) &&
          !m[1].startsWith('shelfle-') &&
          m[1] !== 'empty-state',
      ),
    )
    expect(own).toEqual([])
  })
})
