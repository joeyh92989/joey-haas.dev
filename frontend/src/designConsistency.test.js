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

/** Every non-test source file, .js as well as .jsx (for import rules). */
function walkSources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walkSources(path)
    return /\.jsx?$/.test(entry.name) && !/\.test\./.test(entry.name)
      ? [path]
      : []
  })
}

const sources = walkSources(SRC).map((path) => ({
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
  'pages/HowItWorks.jsx',
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

  // docs/design-system.md → One of each: the catalogue number is for
  // collections only, so only the record card draws one until a collection
  // page is added to this list on purpose.
  it('draws a catalogue number only inside RecordCard', () => {
    const CATALOGUE_ALLOWED = new Set([
      'components/CatalogueNumber.jsx',
      'components/RecordCard.jsx',
    ])
    expect(
      offenders(
        (f) =>
          (/CatalogueNumber(\.jsx)?['"]/.test(f.text) ||
            /<CatalogueNumber[\s>]/.test(f.text)) &&
          !CATALOGUE_ALLOWED.has(f.name),
      ),
    ).toEqual([])
  })

  it('draws no status square of its own: the mark comes from StatusMark, with its word', () => {
    expect(
      offenders(
        (f) =>
          (f.text.includes('status-mark-square') ||
            f.text.includes('bg-highlight') ||
            (f.text.includes('size-2.5') &&
              f.text.includes('border-[1.5px]'))) &&
          f.name !== 'components/StatusMark.jsx',
      ),
    ).toEqual([])
  })

  it('writes no catalogue number string by hand: "No. 007" comes from CatalogueNumber', () => {
    expect(
      offenders(
        (f) =>
          /No\.\s*\d/.test(f.text) &&
          f.name !== 'components/CatalogueNumber.jsx',
      ),
    ).toEqual([])
  })

  it('imports Base UI only inside components/ui, in .js files too', () => {
    expect(
      sources
        .filter(
          (f) =>
            f.text.includes('@base-ui/react') &&
            !f.name.startsWith('components/ui/'),
        )
        .map((f) => f.name),
    ).toEqual([])
  })

  // The site shell (#529) is built from the shadcn button's look, not from
  // hand-dressed `.btn` elements. The masthead and nav load with the page, so
  // they take `buttonVariants` from `ui/button-variants.js` and not the Base UI
  // `Button` component or `cn`, which add ~40KB to the entry chunk; the search dialog
  // loads on first open and uses both primitives.
  it('draws the eager shell controls with buttonVariants, not the Base UI Button', () => {
    const EAGER = [
      'components/SiteMast.jsx',
      'components/SearchButton.jsx',
      'components/NavSheet.jsx',
      'components/MoreMenu.jsx',
    ]
    const wrong = files
      .filter((f) => EAGER.includes(f.name))
      .filter(
        (f) =>
          !/buttonVariants|mastButton/.test(f.text) ||
          /ui\/button\.jsx/.test(f.text) ||
          /className="btn[ "]/.test(f.text),
      )
      .map((f) => f.name)
    expect(wrong).toEqual([])
  })

  // `cn` is tailwind-merge (~30KB raw) and Base UI is heavy: eager files (the
  // shell, Home, the pages App.jsx imports directly and the record card's
  // parts) use `cx` (lib/cx.js) and `button-variants.js`. A lazy chunk may
  // import either. Only direct imports are checked here; the built entry
  // chunk is checked by scripts/check-entry-chunk.mjs after `npm run build`.
  const EAGER_BANNED =
    /lib\/utils(\.js)?['"]|from ['"]cn['"]|\/ui\/(?![\w-]*-(variants|classes)\.js['"])[\w-]+(\.jsx?)?['"]|@base-ui|\bcn\(/
  const EAGER_FILES = [
    'components/SiteMast.jsx',
    'components/SearchButton.jsx',
    'components/NavSheet.jsx',
    'components/MoreMenu.jsx',
    'components/RecordCard.jsx',
    'components/CatalogueNumber.jsx',
    'components/StatusMark.jsx',
    'components/CoverStrip.jsx',
    'components/ContactLine.jsx',
    'components/DraftBadge.jsx',
    'components/PostMeta.jsx',
    'components/TagList.jsx',
    'components/Kicker.jsx',
    'components/Breadcrumb.jsx',
    'components/PageHeader.jsx',
    'layouts/RootLayout.jsx',
    'pages/Home.jsx',
    'pages/About.jsx',
    'pages/Blog.jsx',
    'pages/BlogPost.jsx',
    'pages/Colophon.jsx',
    'pages/Now.jsx',
    'pages/NotFound.jsx',
    'pages/Projects.jsx',
    'pages/Til.jsx',
    'pages/TilNote.jsx',
    'pages/Trip.jsx',
  ]

  it('keeps cn, Button, Card and Base UI out of the eager files', () => {
    const found = files.filter((f) => EAGER_FILES.includes(f.name))
    expect(found.map((f) => f.name).sort()).toEqual([...EAGER_FILES].sort())
    expect(
      found.filter((f) => EAGER_BANNED.test(f.text)).map((f) => f.name),
    ).toEqual([])
  })

  it('lists every page App.jsx imports directly as eager', () => {
    const app = sources.find((f) => f.name === 'App.jsx').text
    const direct = [
      ...app.matchAll(/^import \w+ from '\.\/pages\/(\w+)\.jsx'/gm),
    ].map((m) => `pages/${m[1]}.jsx`)
    expect(direct.filter((name) => !EAGER_FILES.includes(name))).toEqual([])
  })

  it('catches each banned import pattern', () => {
    for (const line of [
      "import { cn } from '../lib/utils.js'",
      "import { cn } from '@/lib/utils'",
      "import { cn } from 'cn'",
      "import { Card } from './ui/card'",
      "import { Card } from './ui/card.jsx'",
      "import { Button } from '../components/ui/button'",
      "import { Button } from './ui/button.jsx'",
      "import { Badge } from './ui/badge'",
      "import { Badge } from '../components/ui/badge.jsx'",
      "import { Separator } from './ui/separator'",
      "import { Separator } from './ui/separator.jsx'",
      "import { Input } from './ui/input.jsx'",
      "import { Tabs } from '@base-ui/react/tabs'",
      'const x = cn(a, b)',
    ]) {
      expect(EAGER_BANNED.test(line), line).toBe(true)
    }
    for (const line of [
      "import { cx } from '../lib/cx.js'",
      "import { buttonVariants } from '../components/ui/button-variants.js'",
      "import { CARD_SHELL } from './ui/card-classes.js'",
      "import { badgeVariants } from './ui/badge-variants.js'",
    ]) {
      expect(EAGER_BANNED.test(line), line).toBe(false)
    }
  })

  it('draws the search dialog with Button and Input, not bare elements', () => {
    const search = files.find((f) => f.name === 'components/SearchDialog.jsx')
    expect(search.text).not.toMatch(/<button[\s>]|<input[\s>]/)
  })

  it('writes no coloured text with an opacity in the shell', () => {
    const SHELL = [
      'components/SiteMast.jsx',
      'components/MoreMenu.jsx',
      'components/SearchButton.jsx',
      'components/SearchDialog.jsx',
      'components/NavSheet.jsx',
      'components/MobileNavSheet.jsx',
      'components/MastNavLink.jsx',
      'components/SiteFooter.jsx',
      'components/ui/button-variants.js',
    ]
    const found = sources.filter((f) => SHELL.includes(f.name))
    expect(found).toHaveLength(SHELL.length)
    const bad = found
      .filter((f) => /text-[\w-]+\/\d/.test(f.text))
      .map((f) => f.name)
    expect(bad).toEqual([])
  })
})
