# Tracker Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tracker visible on the site and publish Play Next's and Radar's outputs read-only, without a cold start greeting first-time visitors.

**Architecture:** PR1 (A + B + C) is frontend plus build and CI: a nav entry, cover strips and shelf polish, and a build-time snapshot of the public API written by the Render static build and refreshed by a daily GitHub Actions deploy hook. PR2 (D) adds two allowlisted public endpoints in a new `backend/public_outputs.py`, registered on the existing public router, and renders them on `/collection`.

**Tech Stack:** React 19 + react-router v8 + Vitest/jsdom; FastAPI + SQLAlchemy async + pytest on real Postgres; GitHub Actions; Render static site + deploy hook.

Spec: `docs/planning/2026-09-28-tracker-showcase-design.md`. It wins over this plan where they differ.

## Global Constraints

- Public pages other than `/collection*` make no API calls; they may read `/collection/*.json`, a static file on the site's own origin.
- Tokens only in CSS, never raw hex; any new token goes in both theme blocks. Tracker pages are wide via `WIDE_ROUTES`, never page CSS.
- Every non-text mark with an accessible name gets `role="img"`; nothing is hover-only (`:focus-within`, `opacity`/`clip-path`, never `display: none` for revealed controls).
- Viewport logic reads `useMediaQuery`, never `matchMedia`. Shelf prefs go through `readShelfPref` / `writeShelfPref`.
- Public copy is first person ("which I rated 10", "My rating", "My copy"), never second person.
- Public response models are hand-written allowlists; a test pins each model's exact field set.
- Never public: `notes`, `cart_id`, `acquired_at`, `region`, `format_source`, `owned_format`, `pinned_at`, store names, prices, currencies, availability, store URLs, pre-order windows, `score`, `slot`, stored `reason`, `based_on`, `batch_id`, model notes, the signed-in email, any non-public row, anything from Discover.
- No schema change. No public route that writes, generates or spends quota.
- Commits: conventional messages, ≤5 files, each independently valid (tests green), ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, merge or rebase; never commit on `main`.
- After every file change: frontend `npx prettier --write <file>` and `npx eslint <file>` (from `frontend/`); backend `./.venv/bin/ruff format <file>` and `./.venv/bin/ruff check <file>` (from `backend/`). Both suites green before each commit: `cd frontend && npm test`, `cd backend && ./.venv/bin/pytest -q`.
- Snapshot cadence: `cron: '23 9 * * *'` plus `workflow_dispatch`; secret name `RENDER_DEPLOY_HOOK_URL`; site `https://joey-haas.dev`, API `https://api.joey-haas.dev`.

---

## File structure

**PR1 — branch `tracker-showcase`**

| File | Responsibility |
|---|---|
| `frontend/src/lib/snapshot.js` (new) | `readSnapshot(name)`: same-origin fetch of `/collection/{name}.json`, shape-checked, never throws |
| `frontend/src/lib/shelf.js` | gains `topFavourites(items, limit)` |
| `frontend/src/components/CoverStrip.jsx` (new) | four decorative favourite covers from the snapshot |
| `frontend/src/layouts/RootLayout.jsx` | `NAV` list; Blog gated on published posts |
| `frontend/src/pages/Home.jsx`, `Projects.jsx`, `content/projects.js` | Collection card, strip, `more` link support |
| `frontend/src/components/FilterChips.jsx` | hides single-member groups |
| `frontend/src/pages/Collection.jsx` | On cartridge block, bar axes, snapshot-first load |
| `frontend/src/pages/Item.jsx` | My rating, My copy line, snapshot preview |
| `frontend/src/index.css` | cover strip, bar axis, cartridge block, copy line |
| `frontend/scripts/fetch-snapshot.mjs` (new) | build step writing `public/collection/*.json` |
| `frontend/scripts/README.md` (new) | both build scripts documented |
| `.github/workflows/snapshot.yml` (new) | daily compare + deploy hook |
| `scripts/smoke.sh`, `README.md`, `CLAUDE.md`, `.gitignore`, `frontend/package.json` | wiring and docs |

**PR2 — branch `tracker-showcase-public`**

| File | Responsibility |
|---|---|
| `backend/picker.py` | first-person `_named`; `public_reasons` |
| `backend/public_outputs.py` (new) | `PublicPickOut`, `PublicRadarOut`, `load_public_picks`, `load_public_radar` |
| `backend/public.py` | registers `/picks` and `/radar` on the public router |
| `backend/tests/test_public_outputs.py` (new) | pins, selection, leak tests |
| `backend/tests/test_public.py` | name checks cover the new models, one named exception |
| `backend/sources/igdb.py`, `backend/scripts/record_igdb_fixtures.py`, fixtures | IGDB `url` |
| `frontend/src/pages/Collection.jsx` | Recent picks, Coming to cartridge |

---

# PR1 — Site shell, polish, snapshot (branch `tracker-showcase`)

Zone-start SHA: record `git rev-parse HEAD` before Task 1.

### Task 1: `readSnapshot`

**Files:**
- Create: `frontend/src/lib/snapshot.js`
- Test: `frontend/src/lib/snapshot.test.js`

**Interfaces:**
- Produces: `readSnapshot(name: 'items' | 'stats'): Promise<any | null>`. It is imported as `import { readSnapshot } from '../lib/snapshot.js'`, and tests mock that module path.

- [ ] **Step 1: Write the failing test** — `frontend/src/lib/snapshot.test.js`:

```js
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSnapshot } from './snapshot.js'

function stubFetch(impl) {
  const fetch = vi.fn(impl)
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readSnapshot', () => {
  it("reads a snapshot from the site's own origin, not the API", async () => {
    const fetch = stubFetch(async () => ({
      ok: true,
      json: async () => [{ id: '1' }],
    }))
    expect(await readSnapshot('items')).toEqual([{ id: '1' }])
    expect(fetch).toHaveBeenCalledWith('/collection/items.json')
  })

  it('is null when the file is missing', async () => {
    stubFetch(async () => ({ ok: false, status: 404, json: async () => ({}) }))
    expect(await readSnapshot('items')).toBeNull()
  })

  // Render and Vite both answer an unknown path with the SPA's index.html.
  it('is null when the host answered with the page instead of JSON', async () => {
    stubFetch(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token <')
      },
    }))
    expect(await readSnapshot('stats')).toBeNull()
  })

  it('is null when the request throws', async () => {
    stubFetch(async () => {
      throw new TypeError('offline')
    })
    expect(await readSnapshot('items')).toBeNull()
  })

  it('is null for a body of the wrong shape', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ total: 1 }) }))
    expect(await readSnapshot('items')).toBeNull()
    stubFetch(async () => ({ ok: true, json: async () => [] }))
    expect(await readSnapshot('stats')).toBeNull()
  })

  it('is null for an unknown name, without a request', async () => {
    const fetch = stubFetch(async () => ({ ok: true, json: async () => [] }))
    expect(await readSnapshot('../secrets')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/lib/snapshot.test.js`
Expected: FAIL. The import of `./snapshot.js` can't be resolved.

- [ ] **Step 3: Implement** — `frontend/src/lib/snapshot.js`:

```js
/**
 * The build-time snapshot of the public collection.
 *
 * `scripts/fetch-snapshot.mjs` writes the public API's response bodies,
 * verbatim, to `/collection/{name}.json` when the site is built, so the
 * showcase can paint before the free-tier backend wakes. They are static files
 * on the site's own origin, not API calls, which is why pages outside
 * /collection may read them.
 *
 * A missing snapshot is normal (a local build, or a build whose fetch
 * failed), and both Render and Vite answer an unknown path with index.html,
 * so a failed parse is treated exactly like a 404.
 */

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/** Each snapshot's name and the shape its body must have to be used. */
const SHAPES = {
  items: Array.isArray,
  stats: isObject,
}

/**
 * Reads one snapshot.
 *
 * @param {string} name One of the SHAPES keys.
 * @returns {Promise<any|null>} The parsed body, or null when it is missing,
 *   unreadable or the wrong shape. Never rejects.
 */
export async function readSnapshot(name) {
  const valid = SHAPES[name]
  if (!valid) return null
  try {
    const response = await fetch(`/collection/${name}.json`)
    if (!response.ok) return null
    const body = await response.json()
    return valid(body) ? body : null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd frontend && npx vitest run src/lib/snapshot.test.js`
Expected: 6 passed.

- [ ] **Step 5: Format, lint, full suite**

Run: `cd frontend && npx prettier --write src/lib/snapshot.js src/lib/snapshot.test.js && npx eslint src/lib/snapshot.js src/lib/snapshot.test.js && npm test`
Expected: clean; all suites pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/snapshot.js frontend/src/lib/snapshot.test.js
git commit -m "feat(collection): read the build-time snapshot of the public shelf"
```

---

### Task 2: `topFavourites` and `CoverStrip`

**Files:**
- Modify: `frontend/src/lib/shelf.js` (append after `countBy`)
- Modify: `frontend/src/pages/Collection.jsx:174-181` (`FavoritesRow` uses the helper)
- Create: `frontend/src/components/CoverStrip.jsx`
- Test: `frontend/src/lib/shelf.test.js`, `frontend/src/components/CoverStrip.test.jsx`

**Interfaces:**
- Consumes: `readSnapshot` (Task 1).
- Produces:
  - `topFavourites(items: object[], limit = Infinity): object[]` from `lib/shelf.js`.
  - The default export `CoverStrip()`, which takes no props and renders `span.cover-strip[aria-hidden]` or nothing.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/lib/shelf.test.js`, and add `topFavourites` to its import from `./shelf.js`:

```js
describe('topFavourites', () => {
  const rows = [
    { id: 'a', title: 'Axiom', favorite: true, rating: 7 },
    { id: 'b', title: 'Bastion', favorite: true, rating: 10 },
    { id: 'c', title: 'Celeste', favorite: false, rating: 10 },
    { id: 'd', title: 'Dredge', favorite: true, rating: null },
    { id: 'e', title: 'Echo', favorite: true, rating: 7 },
  ]

  it('keeps favourites, highest rated first, unrated last, ties by title', () => {
    expect(topFavourites(rows).map((row) => row.id)).toEqual([
      'b',
      'a',
      'e',
      'd',
    ])
  })

  it('stops at the limit', () => {
    expect(topFavourites(rows, 2).map((row) => row.id)).toEqual(['b', 'a'])
  })

  it('never mutates its input', () => {
    const copy = structuredClone(rows)
    topFavourites(rows, 1)
    expect(rows).toEqual(copy)
  })
})
```

Create `frontend/src/components/CoverStrip.test.jsx`:

```jsx
import '@testing-library/jest-dom'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readSnapshot } from '../lib/snapshot.js'
import CoverStrip from './CoverStrip.jsx'

vi.mock('../lib/snapshot.js', () => ({ readSnapshot: vi.fn() }))

const favourite = (id, rating) => ({
  id,
  type: 'game',
  title: id,
  cover_url: `https://images.igdb.com/${id}.jpg`,
  favorite: true,
  rating,
})

beforeEach(() => {
  vi.mocked(readSnapshot).mockReset()
})

describe('CoverStrip', () => {
  it('shows four favourite covers, highest rated first, as decoration', async () => {
    vi.mocked(readSnapshot).mockResolvedValue([
      favourite('low', 6),
      favourite('top', 10),
      favourite('mid', 8),
      favourite('high', 9),
      favourite('lowest', 5),
      { ...favourite('plain', 10), favorite: false },
    ])
    const { container } = render(<CoverStrip />)

    await waitFor(() =>
      expect(container.querySelectorAll('.cover-strip img')).toHaveLength(4),
    )
    const sources = [...container.querySelectorAll('.cover-strip img')].map(
      (img) => img.getAttribute('src'),
    )
    expect(sources).toEqual([
      'https://images.igdb.com/top.jpg',
      'https://images.igdb.com/high.jpg',
      'https://images.igdb.com/mid.jpg',
      'https://images.igdb.com/low.jpg',
    ])
    expect(container.querySelector('.cover-strip')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(readSnapshot).toHaveBeenCalledWith('items')
  })

  it('renders nothing without a snapshot', async () => {
    vi.mocked(readSnapshot).mockResolvedValue(null)
    const { container } = render(<CoverStrip />)
    await waitFor(() => expect(readSnapshot).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when nothing is a favourite', async () => {
    vi.mocked(readSnapshot).mockResolvedValue([
      { ...favourite('plain', 9), favorite: false },
    ])
    const { container } = render(<CoverStrip />)
    await waitFor(() => expect(readSnapshot).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npx vitest run src/lib/shelf.test.js src/components/CoverStrip.test.jsx`
Expected: FAIL. `topFavourites` is not exported, and `CoverStrip.jsx` does not exist.

- [ ] **Step 3: Implement**

Append to `frontend/src/lib/shelf.js` (after `countBy`):

```js
/**
 * Favourites, highest rated first (unrated last), then by title: the order
 * of the favourites row and of every cover strip, kept in one place so the
 * two cannot disagree.
 *
 * @param {object[]} items Shelf rows.
 * @param {number} [limit] How many to keep; all of them by default.
 * @returns {object[]} A new array; the input is not mutated.
 */
export function topFavourites(items, limit = Infinity) {
  return sortItems(
    items.filter((item) => item.favorite),
    'rating',
    'desc',
    0,
  ).slice(0, limit)
}
```

In `frontend/src/pages/Collection.jsx`, add `topFavourites` to the `../lib/shelf.js` import, then replace lines 175-180 of `FavoritesRow`:

```jsx
  const all = sortItems(
    items.filter((item) => item.favorite),
    'rating',
    'desc',
    0,
  )
```

with:

```jsx
  const all = topFavourites(items)
```

(`sortItems` stays imported; the grid still uses it.)

Create `frontend/src/components/CoverStrip.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { topFavourites } from '../lib/shelf.js'
import { readSnapshot } from '../lib/snapshot.js'
import CoverImage from './CoverImage.jsx'

const STRIP_SIZE = 4

/**
 * Four favourite covers from the build-time snapshot, for Home and Projects.
 *
 * Those pages make no API calls, so this reads the static snapshot and
 * renders nothing until it arrives, or at all when there is none: the card
 * around it still reads as text. The covers are decorative. The strip sits
 * inside or beside a link whose text already names the destination, so
 * repeating four titles to a screen reader would be noise, and a link per
 * cover would nest links.
 */
export default function CoverStrip() {
  const [covers, setCovers] = useState([])

  useEffect(() => {
    let cancelled = false
    readSnapshot('items').then((items) => {
      if (!cancelled && items) setCovers(topFavourites(items, STRIP_SIZE))
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (covers.length === 0) return null
  return (
    <span className="cover-strip" aria-hidden="true">
      {covers.map((item) => (
        <CoverImage key={item.id} src={item.cover_url} type={item.type} />
      ))}
    </span>
  )
}
```

Append to `frontend/src/index.css`, after the `.link-card-sub` rule:

```css
/* Home and Projects: four favourite covers from the build-time snapshot. */
.cover-strip {
  display: grid;
  gap: 0.375rem;
  grid-template-columns: repeat(4, minmax(0, 3.25rem));
  margin-top: 0.75rem;
}
```

That makes six files, so `index.css` goes in with Task 3's commit. The boundary for this task is the five listed above.

- [ ] **Step 4: Run them and watch them pass**

Run: `cd frontend && npx vitest run src/lib/shelf.test.js src/components/CoverStrip.test.jsx src/pages/Collection.test.jsx`
Expected: all pass. The favourites-row tests in `Collection.test.jsx` still pass through the helper.

- [ ] **Step 5: Format, lint, full suite**

Run: `cd frontend && npx prettier --write src/lib/shelf.js src/lib/shelf.test.js src/pages/Collection.jsx src/components/CoverStrip.jsx src/components/CoverStrip.test.jsx src/index.css && npx eslint src && npm test`
Expected: clean, all pass.

- [ ] **Step 6: Commit** (five files; `index.css` stays unstaged until Task 3)

```bash
git add frontend/src/lib/shelf.js frontend/src/lib/shelf.test.js frontend/src/pages/Collection.jsx frontend/src/components/CoverStrip.jsx frontend/src/components/CoverStrip.test.jsx
git commit -m "feat(collection): add a favourites cover strip read from the snapshot"
```

---

### Task 3: Nav and Home

**Files:**
- Modify: `frontend/src/layouts/RootLayout.jsx:1-5, 119-128`
- Modify: `frontend/src/pages/Home.jsx`
- Modify: `frontend/src/index.css` (the `.cover-strip` rule from Task 2)
- Test: `frontend/src/layouts/RootLayout.test.jsx`, `frontend/src/pages/Home.test.jsx` (new)

**Interfaces:**
- Consumes: `CoverStrip` (Task 2); `posts` from `content/posts.js`.
- Produces: nav order Home · About · Projects · Collection · (Blog).

- [ ] **Step 1: Write the failing tests**

At the top of `frontend/src/layouts/RootLayout.test.jsx`:
- Add `within` to the `@testing-library/react` import.
- After the imports, add the lines below. The mutable array is shared with the mock, so a test can publish a post by pushing onto it.

```jsx
// posts.js globs frontend/posts/*.md, and the Vitest config has no markdown
// plugin, so the module is replaced. Tests push onto this array to publish.
const content = vi.hoisted(() => ({ posts: [] }))
vi.mock('../content/posts.js', () => content)
```

Add `content.posts.length = 0` to the existing `afterEach`, then add:

```jsx
describe('RootLayout nav', () => {
  function navLabels() {
    return within(screen.getByRole('navigation'))
      .getAllByRole('link')
      .map((link) => link.textContent)
  }

  it('lists Collection, and no Blog while nothing is published', () => {
    renderAt('/about')
    expect(navLabels()).toEqual(['Home', 'About', 'Projects', 'Collection'])
  })

  it('adds Blog last once a post is published', () => {
    content.posts.push({
      slug: 'first',
      frontmatter: { title: 'First', date: '2026-10-01' },
    })
    renderAt('/about')
    expect(navLabels()).toEqual([
      'Home',
      'About',
      'Projects',
      'Collection',
      'Blog',
    ])
  })

  it('keeps Collection current on an item page', () => {
    renderAt('/collection/abc')
    expect(
      within(screen.getByRole('navigation')).getByRole('link', {
        name: 'Collection',
      }),
    ).toHaveAttribute('aria-current', 'page')
  })
})
```

Create `frontend/src/pages/Home.test.jsx`:

```jsx
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Home from './Home.jsx'

const content = vi.hoisted(() => ({ posts: [] }))
vi.mock('../content/posts.js', () => content)
vi.mock('../lib/snapshot.js', () => ({ readSnapshot: vi.fn(async () => null) }))

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  )
}

afterEach(() => {
  content.posts.length = 0
})

describe('Home', () => {
  it('links to the collection from its own card', () => {
    renderHome()
    expect(
      screen.getByRole('link', { name: /What I’m playing/ }),
    ).toHaveAttribute('href', '/collection')
  })

  it('keeps the About and Projects cards', () => {
    renderHome()
    expect(screen.getByRole('link', { name: /More about me/ })).toHaveAttribute(
      'href',
      '/about',
    )
    expect(screen.getByRole('link', { name: /See my work/ })).toHaveAttribute(
      'href',
      '/projects',
    )
  })

  it('has no Latest block while nothing is published', () => {
    renderHome()
    expect(screen.queryByText('Latest')).toBeNull()
  })

  it('links the newest post as Latest once one is published', () => {
    content.posts.push({
      slug: 'how-the-tracker-works',
      frontmatter: { title: 'How the tracker works', date: '2026-10-01' },
    })
    renderHome()
    expect(
      screen.getByRole('link', { name: /How the tracker works/ }),
    ).toHaveAttribute('href', '/blog/how-the-tracker-works')
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npx vitest run src/layouts/RootLayout.test.jsx src/pages/Home.test.jsx`
Expected: FAIL. There is no Collection link, and "What I’m playing" is not found.

- [ ] **Step 3: Implement**

In `frontend/src/layouts/RootLayout.jsx`:
- Add `import { posts } from '../content/posts.js'` after the `profile` import.
- After `isWideRoute`, add the block below.

```jsx
/**
 * The nav, in order. Blog is listed only while a published post exists:
 * production builds compile drafts to null, so a repo of drafts would
 * otherwise put a nav item in front of an empty page.
 *
 * @param {boolean} hasPosts Whether any post is published.
 * @returns {{to: string, label: string, end?: boolean}[]}
 */
function navItems(hasPosts) {
  return [
    { to: '/', label: 'Home', end: true },
    { to: '/about', label: 'About' },
    { to: '/projects', label: 'Projects' },
    { to: '/collection', label: 'Collection' },
    ...(hasPosts ? [{ to: '/blog', label: 'Blog' }] : []),
  ]
}
```

Then replace the four hand-written `NavLink`s inside `<nav>` with:

```jsx
        <nav>
          {navItems(posts.length > 0).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {item.label}
            </NavLink>
          ))}
        </nav>
```

In `frontend/src/pages/Home.jsx`:
- Add `import CoverStrip from '../components/CoverStrip.jsx'`.
- Update the doc comment: "two ways onward" becomes "three ways onward".
- After the `/projects` card, add the card below.

```jsx
        <Link className="link-card" to="/collection">
          <span className="link-card-title">What I’m playing</span>
          <span className="link-card-arrow"> &rarr;</span>
          <span className="link-card-sub">
            The collection: what I own, finish and want next.
          </span>
          <CoverStrip />
        </Link>
```

- [ ] **Step 4: Run them and watch them pass**

Run: `cd frontend && npx vitest run src/layouts/RootLayout.test.jsx src/pages/Home.test.jsx`
Expected: all pass. The wide-route and outlet tests are unaffected.

- [ ] **Step 5: Format, lint, full suite**

Run: `cd frontend && npx prettier --write src/layouts/RootLayout.jsx src/layouts/RootLayout.test.jsx src/pages/Home.jsx src/pages/Home.test.jsx src/index.css && npx eslint src && npm test`

- [ ] **Step 6: Visual check.** `preview_start` the frontend dev server, then open `/` at 375px width and at desktop width, in both themes. Check three things:
  - The three cards wrap without horizontal scroll.
  - Collection shows in the nav.
  - No Blog link shows in dev unless a draft exists. `example.md` is a draft, and dev includes drafts, so Blog does show in dev. That is expected; the production build omits it.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/layouts/RootLayout.jsx frontend/src/layouts/RootLayout.test.jsx frontend/src/pages/Home.jsx frontend/src/pages/Home.test.jsx frontend/src/index.css
git commit -m "feat(site): put Collection in the nav and on Home; hide Blog until a post exists"
```

---

### Task 4: Projects card strip and `more` link

**Files:**
- Modify: `frontend/src/pages/Projects.jsx`
- Modify: `frontend/src/content/projects.js`
- Modify: `frontend/src/index.css`
- Test: `frontend/src/pages/Projects.test.jsx` (new)

**Interfaces:**
- Consumes: `CoverStrip` (Task 2).
- Produces: project fields `strip?: 'favourites'` and `more?: { to: string, label: string }`. Task E sets `more` on the tracker card.

- [ ] **Step 1: Write the failing test** — `frontend/src/pages/Projects.test.jsx`:

```jsx
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import Projects from './Projects.jsx'

vi.mock('../lib/snapshot.js', () => ({
  readSnapshot: vi.fn(async () => [
    {
      id: '1',
      type: 'game',
      title: 'Hades',
      cover_url: 'https://images.igdb.com/hades.jpg',
      favorite: true,
      rating: 10,
    },
  ]),
}))

vi.mock('../content/projects.js', () => ({
  projects: [
    {
      name: 'Media Collection',
      description: 'A tracker.',
      tech: ['React'],
      to: '/collection',
      url: null,
      strip: 'favourites',
      more: { to: '/blog/how-the-tracker-works', label: 'How it works' },
    },
    {
      name: 'This Website',
      description: 'This site.',
      tech: ['Vite'],
      url: 'https://github.com/joeyh92989/joey-haas.dev',
    },
  ],
}))

function renderProjects() {
  return render(
    <MemoryRouter>
      <Projects />
    </MemoryRouter>,
  )
}

describe('Projects', () => {
  it('gives a card with a strip its favourite covers', async () => {
    const { container } = renderProjects()
    const cards = container.querySelectorAll('.project-card')
    await waitFor(() =>
      expect(cards[0].querySelectorAll('.cover-strip img')).toHaveLength(1),
    )
    expect(cards[1].querySelector('.cover-strip')).toBeNull()
  })

  it('renders a more link only where one is set', () => {
    renderProjects()
    expect(screen.getByRole('link', { name: /How it works/ })).toHaveAttribute(
      'href',
      '/blog/how-the-tracker-works',
    )
    expect(screen.getAllByRole('link', { name: /How it works/ })).toHaveLength(
      1,
    )
  })

  it('still links each title', () => {
    renderProjects()
    expect(
      screen.getByRole('link', { name: 'Media Collection' }),
    ).toHaveAttribute('href', '/collection')
    expect(screen.getByRole('link', { name: 'This Website' })).toHaveAttribute(
      'href',
      'https://github.com/joeyh92989/joey-haas.dev',
    )
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/pages/Projects.test.jsx`
Expected: FAIL. No cover strip is rendered and no "How it works" link exists.

- [ ] **Step 3: Implement**

In `frontend/src/pages/Projects.jsx`:
- Add `import CoverStrip from '../components/CoverStrip.jsx'`.
- Extend the doc comment with the two new fields: "`strip: 'favourites'` adds the collection's cover strip, read from the build-time snapshot, not the API; `more` is a secondary internal link, set only once its page exists."
- Replace `<p>{project.description}</p>` with:

```jsx
            {project.strip === 'favourites' && <CoverStrip />}
            <p>{project.description}</p>
            {project.more && (
              <p className="project-more">
                <Link to={project.more.to}>
                  {project.more.label} &rarr;
                </Link>
              </p>
            )}
```

In `frontend/src/content/projects.js`:
- Add `strip: 'favourites',` to the Media Collection entry, after `url: null`.
- Extend the doc comment: "`strip: 'favourites'` shows the collection's favourite covers; `more: { to, label }` is a secondary internal link, added only once its target exists."

Append to `frontend/src/index.css`, after the `.project-card p` rule:

```css
.project-card .cover-strip {
  margin: 0 0 0.75rem;
}

.project-more {
  font-size: 0.875rem;
  margin: 0.5rem 0 0;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd frontend && npx vitest run src/pages/Projects.test.jsx`
Expected: 3 passed.

- [ ] **Step 5: Format, lint, full suite, then commit**

Run: `cd frontend && npx prettier --write src/pages/Projects.jsx src/pages/Projects.test.jsx src/content/projects.js src/index.css && npx eslint src && npm test`

```bash
git add frontend/src/pages/Projects.jsx frontend/src/pages/Projects.test.jsx frontend/src/content/projects.js frontend/src/index.css
git commit -m "feat(site): give the tracker's project card a cover strip and a more-link slot"
```

---

### Task 5: Hide single-member chip groups

**Files:**
- Modify: `frontend/src/components/FilterChips.jsx`
- Test: `frontend/src/components/FilterChips.test.jsx`

**Interfaces:**
- Produces: `FilterChips` skips a group when at most one of its chips would render and none is pressed. Both shelves are affected.

- [ ] **Step 1: Fix the fixture and write the failing tests**

In `frontend/src/components/FilterChips.test.jsx`, the `GROUPS` Type group currently shows a single chip (Games 3, Film & TV 0), which would now hide the group. Add a third option after `movie` so the existing tests keep a real choice. Film & TV stays at zero so the zero-chip test still holds.

```js
      { value: 'comic', label: 'Comics', count: 1 },
```

Then add:

```jsx
describe('FilterChips single-member groups', () => {
  const ONE_TYPE = [
    {
      key: 'type',
      label: 'Type',
      options: [
        { value: 'game', label: 'Games', count: 68 },
        { value: 'movie', label: 'Film & TV', count: 0 },
      ],
    },
    {
      key: 'status',
      label: 'Status',
      options: [
        { value: 'backlog', label: 'Backlog', count: 30 },
        { value: 'finished', label: 'Finished', count: 38 },
      ],
    },
  ]

  it('hides a group with one chip to choose, since it filters nothing', () => {
    render(
      <FilterChips groups={ONE_TYPE} value={NO_FILTER} onChange={() => {}} />,
    )
    expect(screen.queryByRole('group', { name: 'Type' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Status' })).toBeInTheDocument()
  })

  it('keeps a group whose chip is pressed, so the filter can be undone', () => {
    render(
      <FilterChips
        groups={ONE_TYPE}
        value={{ ...NO_FILTER, type: 'game' }}
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('group', { name: 'Type' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/components/FilterChips.test.jsx`
Expected: FAIL. The Type group is still rendered.

- [ ] **Step 3: Implement**

In `frontend/src/components/FilterChips.jsx`, add this function after `Chip`:

```jsx
/**
 * Whether a group offers a choice: more than one chip that would render, or
 * a pressed one to clear. A single-member row -- "Games 68" on a games-only
 * shelf -- filters nothing and reads as noise.
 */
function offersChoice(group, value) {
  if (value[group.key] != null) return true
  return group.options.filter((option) => option.count > 0).length > 1
}
```

Change `{groups.map((group) => (` to `{groups.filter((group) => offersChoice(group, value)).map((group) => (`. Then add this sentence to the component's doc comment: "A group with at most one chip to show, and none pressed, is left out."

- [ ] **Step 4: Run it and watch it pass, then run the full suite**

Run: `cd frontend && npx vitest run src/components/FilterChips.test.jsx && npm test`
Expected: all pass.
- If an admin-shelf test asserted a single-member Type group, change that test's fixture the same way: add a second non-zero type. Do not weaken the assertion.
- List any fixture changed this way in the zone report.
- If the fix needs more files than this task declares, **STOP** and report.

- [ ] **Step 5: Format, lint, commit**

Run: `cd frontend && npx prettier --write src/components/FilterChips.jsx src/components/FilterChips.test.jsx && npx eslint src/components`

```bash
git add frontend/src/components/FilterChips.jsx frontend/src/components/FilterChips.test.jsx
git commit -m "feat(shelf): hide a filter group with a single member"
```

---

### Task 6: On cartridge block and bar axes

**Files:**
- Modify: `frontend/src/pages/Collection.jsx`:
  - `34-52`: `lastTwelveMonths`
  - `82-123`: `OnCartridge`
  - `304-367`: the histogram and the strip
  - `547-566`: the stats block
- Modify: `frontend/src/index.css` (after `.rating-bar:focus .rating-bar-count`)
- Test: `frontend/src/pages/Collection.test.jsx`

**Interfaces:**
- Produces: `section.stat-card.stat-cartridge[aria-label="On cartridge"]` inside `.shelf-stats`, and `.bar-axis[aria-hidden]` rows.

- [ ] **Step 1: Write the failing tests**

In `frontend/src/pages/Collection.test.jsx`, replace the body assertion of `'states the on-cartridge line with unknowns kept apart'` with:

```jsx
    const block = screen.getByRole('region', { name: 'On cartridge' })
    expect(block.closest('.shelf-stats')).not.toBeNull()
    expect(
      within(block).getByText('Nintendo Switch 2 — 61 of 68'),
    ).toBeInTheDocument()
    expect(
      within(block).getByText('3 Game-Key Cards · 4 not recorded'),
    ).toBeInTheDocument()
```

In `'has no on-cartridge line before any format is recorded'`, assert `expect(screen.queryByRole('region', { name: 'On cartridge' })).toBeNull()`, replacing whatever it currently queries.

Add to `describe('Collection', ...)`:

```jsx
  it('labels the ends of the ratings axis and titles every bar', async () => {
    stubApi()
    await renderReady()

    const ratings = screen.getByRole('region', { name: 'Ratings' })
    const axis = ratings.querySelector('.bar-axis')
    expect(axis).toHaveAttribute('aria-hidden', 'true')
    expect([...axis.children].map((label) => label.textContent)).toEqual([
      '1',
      '10',
    ])
    for (const bar of within(ratings).getAllByRole('img')) {
      expect(bar).toHaveAttribute('title', bar.getAttribute('aria-label'))
    }
  })

  it('labels each month of the finishes strip with its initial', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-03-20T12:00:00Z'))
    stubApi()
    await renderReady()

    const finishes = screen.getByRole('region', { name: 'Finishes' })
    const axis = finishes.querySelector('.bar-axis')
    expect(axis).toHaveAttribute('aria-hidden', 'true')
    expect(axis.textContent).toBe('AMJJASONDJFM')
    for (const bar of within(finishes).getAllByRole('img')) {
      expect(bar).toHaveAttribute('title', bar.getAttribute('aria-label'))
    }
  })
```

(Faking only `Date` leaves the timers real, so `waitFor` still works. `afterEach` already calls `vi.useRealTimers()`.)

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npx vitest run src/pages/Collection.test.jsx`
Expected: FAIL. There is no "On cartridge" region, no `.bar-axis`, and no `title`.

- [ ] **Step 3: Implement**

In `Collection.jsx`, add a narrow formatter and extend `lastTwelveMonths`:

```jsx
const MONTH_INITIAL = new Intl.DateTimeFormat('en', {
  month: 'narrow',
  timeZone: 'UTC',
})
```

Its return becomes `return { key, label: MONTH_LABEL.format(date), initial: MONTH_INITIAL.format(date) }`.

Replace `OnCartridge` (lines 82-123) with:

```jsx
/**
 * The key-card platforms' copies: how many are full cartridges, of how many,
 * then what the rest are. Unknowns are stated, never folded into the
 * cartridge count. A stats block like its neighbours, with a heading; it
 * renders only once at least one format has been recorded.
 */
function OnCartridge({ byFormat }) {
  const platforms = Object.entries(byFormat ?? {}).filter(
    ([, counts]) =>
      counts.game_card + counts.game_key_card + counts.code_in_box > 0,
  )
  if (platforms.length === 0) return null
  return (
    <section className="stat-card stat-cartridge" aria-label="On cartridge">
      <h2>On cartridge</h2>
      {platforms.map(([platformId, counts]) => {
        const name =
          KEY_CARD_PLATFORM_NAMES[platformId] ?? `Platform ${platformId}`
        const rest = [
          [
            counts.game_key_card,
            counts.game_key_card === 1 ? 'Game-Key Card' : 'Game-Key Cards',
          ],
          [
            counts.code_in_box,
            counts.code_in_box === 1 ? 'code in a box' : 'codes in a box',
          ],
          [counts.unknown, 'not recorded'],
        ]
          .filter(([count]) => count > 0)
          .map(([count, label]) => `${count} ${label}`)
        return (
          <div key={platformId} className="cartridge-platform">
            <p>{`${name} — ${counts.game_card} of ${counts.total}`}</p>
            {rest.length > 0 && <p className="muted">{rest.join(' · ')}</p>}
          </div>
        )
      })}
    </section>
  )
}
```

In `RatingHistogram`:
- Wrap the `<div className="rating-bars">…</div>` in `<div className="bar-column">…</div>`.
- On each `span.rating-bar`, add `title={\`Rated ${rating}: ${plural(counts[index], 'item')}\`}`. It is the same string as the `aria-label`, so hoist it into a `const label` inside the map and use it for both.
- After the bars div, inside `.bar-column`, add:

```jsx
          <div className="bar-axis" aria-hidden="true">
            <span>1</span>
            <span>10</span>
          </div>
```

Update its doc comment to: "Ten bars for ratings 1 to 10 beside the average, with the axis's ends labelled. Each bar is focusable and names its count, and its title repeats that name; the numeral above it shows on hover and on focus alike."

In `FinishesStrip`:
- Wrap `.month-bars` in `.bar-column` the same way.
- Give each `span.month-bar` the attribute `title={label}`, where `const label = \`${month.label}: ${counts[index]} finished\`` is also used for the `aria-label`.
- Add:

```jsx
          <div className="bar-axis bar-axis-months" aria-hidden="true">
            {months.map((month) => (
              <span key={month.key}>{month.initial}</span>
            ))}
          </div>
```

In the page body, move `<OnCartridge byFormat={stats.by_format} />` inside `.shelf-stats`, after the `FinishesStrip` conditional, and delete the old `{stats && <OnCartridge … />}` line.

Append to `frontend/src/index.css` after the `.rating-bar:focus .rating-bar-count` rule:

```css
/* The bars and their axis labels, stacked; the labels are aria-hidden
   because every bar already names itself. */
.bar-column {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.bar-column .rating-bars,
.bar-column .month-bars {
  flex: none;
}

.bar-axis {
  color: var(--text-muted);
  display: flex;
  font-size: 0.6875rem;
  justify-content: space-between;
  line-height: 1;
}

.bar-axis-months {
  gap: 3px;
}

.bar-axis-months span {
  flex: 1 1 0;
  text-align: center;
}

.cartridge-platform p {
  margin: 0 0 0.25rem;
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `cd frontend && npx vitest run src/pages/Collection.test.jsx`
Expected: all pass.

- [ ] **Step 5: Format, lint, full suite**

Run: `cd frontend && npx prettier --write src/pages/Collection.jsx src/pages/Collection.test.jsx src/index.css && npx eslint src && npm test`

- [ ] **Step 6: Visual check.**
  - Open `/collection` in the preview. With the backend running locally, or with a snapshot from Task 9's `npm run snapshot` once it exists, check the stats row in both themes at 375px and at desktop width.
  - The axis labels must not overlap, and the four stat blocks must wrap.
  - The axis text uses `--text-muted`, which has already been measured in both themes, so no new contrast work is needed.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Collection.jsx frontend/src/pages/Collection.test.jsx frontend/src/index.css
git commit -m "feat(collection): label the stats axes and make On cartridge a stats block"
```

---

### Task 7: `/collection` paints the snapshot first

**Files:**
- Modify: `frontend/src/pages/Collection.jsx:369-432` (doc comment, effect)
- Test: `frontend/src/pages/Collection.test.jsx`

**Interfaces:**
- Consumes: `readSnapshot('items')` and `readSnapshot('stats')` (Task 1).
- Produces: the loading table in the spec (§C "`/collection` loading").

- [ ] **Step 1: Write the failing tests**

At the top of `Collection.test.jsx`:
- Add `beforeEach` to the vitest import.
- Import `readSnapshot` from `'../lib/snapshot.js'`.
- Add the mock and `beforeEach` below. The default snapshot is null, so every existing test runs the no-snapshot path it was written for.

```jsx
vi.mock('../lib/snapshot.js', () => ({ readSnapshot: vi.fn() }))

beforeEach(() => {
  vi.mocked(readSnapshot).mockReset()
  vi.mocked(readSnapshot).mockResolvedValue(null)
})

/** A snapshot of the given rows and stats, as the build wrote them. */
function stubSnapshot({ items = ITEMS, stats = STATS } = {}) {
  vi.mocked(readSnapshot).mockImplementation(async (name) =>
    name === 'items' ? items : name === 'stats' ? stats : null,
  )
}
```

Add a new describe block:

```jsx
describe('Collection snapshot', () => {
  it('paints the snapshot while the server wakes, with no waking notice', async () => {
    stubSnapshot()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    await renderReady()

    expect(gridTitles()).toEqual(['Gloomhaven', 'Dune'])
    await new Promise((done) => setTimeout(done, 2100))
    expect(screen.queryByText(/waking the server/i)).toBeNull()
  })

  it('replaces the snapshot with live data when it arrives', async () => {
    stubSnapshot({ items: [ITEMS[0]] })
    stubApi()
    renderPage()

    await waitFor(() => expect(gridTitles()).toEqual(['Gloomhaven', 'Dune']))
  })

  it('keeps the snapshot when the live load fails', async () => {
    stubSnapshot()
    stubApi({ itemsOk: false })
    await renderReady()

    await new Promise((done) => setTimeout(done, 50))
    expect(screen.queryByText(/could not be loaded/i)).toBeNull()
    expect(gridTitles()).toHaveLength(2)
  })

  it('ignores a snapshot that arrives after the live data', async () => {
    const releases = []
    vi.mocked(readSnapshot).mockImplementation(
      (name) =>
        new Promise((done) => {
          releases.push(() => done(name === 'items' ? [ITEMS[0]] : STATS))
        }),
    )
    stubApi()
    await renderReady()
    expect(gridTitles()).toEqual(['Gloomhaven', 'Dune'])

    for (const release of releases) release()
    await new Promise((done) => setTimeout(done, 50))
    expect(gridTitles()).toEqual(['Gloomhaven', 'Dune'])
  })
})
```

The last test releases both pending reads. The page waits for items and stats together, so releasing only one would never reach the code under test. The grid order `['Gloomhaven', 'Dune']` is the default "added, newest first" sort that `'sorts by recently added by default'` already pins.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npx vitest run src/pages/Collection.test.jsx -t snapshot`
Expected: FAIL. The page never reads the snapshot, so the first test sees only the skeleton.

- [ ] **Step 3: Implement**

In `Collection.jsx`, import `readSnapshot` from `'../lib/snapshot.js'`. Replace the doc comment's first paragraph with:

```
 * Unlike every other public page, this one calls the API. The free-tier
 * backend sleeps after about fifteen minutes, so the page first paints the
 * build-time snapshot (lib/snapshot.js) and swaps in live data when it
 * arrives. Only without a snapshot does a first load wait on the wake-up,
 * which is announced beside a skeleton grid rather than hidden behind a
 * spinner that would read as broken rather than slow.
```

Replace the `useEffect` (lines 420-432) with:

```jsx
  useEffect(() => {
    let cancelled = false
    // Set once live data is applied, so a slower snapshot never overwrites it.
    let live = false
    const timer = setTimeout(() => setSlow(true), 2000)

    Promise.all([readSnapshot('items'), readSnapshot('stats')]).then(
      ([snapshotItems, snapshotStats]) => {
        if (cancelled || live || !snapshotItems) return
        clearTimeout(timer)
        setItems(snapshotItems)
        setStats(snapshotStats)
        setState('ready')
      },
    )

    load().then((result) => {
      if (cancelled) return
      clearTimeout(timer)
      if (result.state === 'ready') {
        live = true
        setItems(result.items)
        setStats(result.stats)
        setState('ready')
      } else {
        // A painted snapshot outranks an error: stale beats nothing.
        setState((current) => (current === 'ready' ? current : 'error'))
      }
    })

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [load])
```

- [ ] **Step 4: Run the file and watch it pass**

Run: `cd frontend && npx vitest run src/pages/Collection.test.jsx`
Expected: all pass, including the existing cold-start, skeleton and failed-load tests, which run on the null snapshot.

- [ ] **Step 5: Format, lint, full suite, then commit**

Run: `cd frontend && npx prettier --write src/pages/Collection.jsx src/pages/Collection.test.jsx && npx eslint src && npm test`

```bash
git add frontend/src/pages/Collection.jsx frontend/src/pages/Collection.test.jsx
git commit -m "feat(collection): paint the build-time snapshot before the API wakes"
```

---

### Task 8: Item page — My rating, My copy, snapshot preview

**Files:**
- Modify: `frontend/src/pages/Item.jsx`
- Modify: `frontend/src/index.css`
- Test: `frontend/src/pages/Item.test.jsx`

**Interfaces:**
- Consumes: `readSnapshot('items')` (Task 1).
- Produces: `p.item-copy` with "My copy: …", "Wanted for …" or "On my want list"; a rating tile that reads "My rating".

- [ ] **Step 1: Write the failing tests and update the pins**

In `Item.test.jsx`:
- Add `beforeEach` to the vitest import.
- Import `readSnapshot` from `'../lib/snapshot.js'`.
- Add the mock and `beforeEach` below.

```jsx
vi.mock('../lib/snapshot.js', () => ({ readSnapshot: vi.fn() }))

beforeEach(() => {
  vi.mocked(readSnapshot).mockReset()
  vi.mocked(readSnapshot).mockResolvedValue(null)
})
```

Replace the test `'orders the chips: own platform, genres, themes, other platforms, format, completeness'` with:

```jsx
  it('keeps the game in the chips and the copy on its own line', async () => {
    stubItem(COPY)
    await renderReady()

    expect(chips()).toEqual([
      ['Roguelike', false],
      ['Action', false],
      ['Fantasy', true],
      ['PC', true],
      ['PlayStation 4', true],
    ])
    expect(
      screen.getByText(
        'My copy: Nintendo Switch · Full game on cartridge · Complete in box',
      ),
    ).toBeInTheDocument()
  })
```

In the three format tests, change the expectations as follows:
- `'names a %s copy'`: expect `screen.getByText(\`My copy: Nintendo Switch · ${label} · Complete in box\`)`.
- `'says a Switch 2 copy…'`: expect `screen.getByText('My copy: Nintendo Switch 2 · Format not recorded · Complete in box')`.
- `'has no format chip for another platform…'`: expect `screen.getByText('My copy: Nintendo Switch')` and `expect(screen.queryByText(/Format not recorded/)).toBeNull()`.

Then add:

```jsx
describe('Item voice and copy', () => {
  it.each([false, true])('reads My rating (signed in: %s)', async (signedIn) => {
    stubItem()
    await renderReady({ signedIn })
    expect(screen.getByText('My rating')).toBeInTheDocument()
    expect(screen.queryByText('Your rating')).toBeNull()
  })

  it('says what platform a wanted game is wanted for', async () => {
    stubItem({ wanted: true, platform: 'Nintendo Switch 2' })
    await renderReady()
    expect(screen.getByText('Wanted for Nintendo Switch 2')).toBeInTheDocument()
    expect(screen.queryByText(/^My copy/)).toBeNull()
  })

  it('says a wanted game with no platform is on the want list', async () => {
    stubItem({ wanted: true, platform: null })
    await renderReady()
    expect(screen.getByText('On my want list')).toBeInTheDocument()
  })
})

describe('Item snapshot preview', () => {
  const ROW = {
    id: ID,
    type: 'game',
    title: 'Hades',
    year: 2020,
    creator: 'Supergiant Games',
    cover_url: 'https://images.igdb.com/hades.jpg',
    status: 'finished',
    rating: 9,
    favorite: true,
    finished_at: '2026-06-12',
    genres: ['Roguelike', 'Action'],
    community_score: 93.4,
    platforms: ['PC', 'Nintendo Switch'],
    created_at: '2026-01-01T00:00:00Z',
    wanted: false,
    platform: 'Nintendo Switch',
    physical_format: 'game_card',
    completeness: null,
    pinned: false,
  }

  it('paints the card fields from the snapshot while the server wakes', async () => {
    vi.mocked(readSnapshot).mockResolvedValue([ROW])
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    await renderReady()

    expect(screen.getByText('9 / 10')).toBeInTheDocument()
    expect(
      screen.getByText('My copy: Nintendo Switch · Full game on cartridge'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Defy the god of the dead.')).toBeNull()
    await new Promise((done) => setTimeout(done, 2100))
    expect(screen.queryByText(/waking the server/i)).toBeNull()
  })

  it('adds the detail when the API answers', async () => {
    vi.mocked(readSnapshot).mockResolvedValue([ROW])
    stubItem()
    await renderReady()
    expect(
      await screen.findByText('Defy the god of the dead.'),
    ).toBeInTheDocument()
  })

  it('believes the API over the snapshot about a removed item', async () => {
    vi.mocked(readSnapshot).mockResolvedValue([ROW])
    stubApi({ ok: false, status: 404, json: async () => ({}) })
    renderPage()
    expect(
      await screen.findByRole('heading', { name: 'Not found' }),
    ).toBeInTheDocument()
  })

  it('keeps the painted fields when the detail fails', async () => {
    vi.mocked(readSnapshot).mockResolvedValue([ROW])
    stubApi({ ok: false, status: 500, json: async () => ({}) })
    await renderReady()
    expect(
      await screen.findByText(
        'More detail could not be loaded. Try again shortly.',
      ),
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npx vitest run src/pages/Item.test.jsx`
Expected: FAIL. The page still says "Your rating", has no `.item-copy`, and never reads the snapshot.

- [ ] **Step 3: Implement** — `frontend/src/pages/Item.jsx`

1. Add `import { readSnapshot } from '../lib/snapshot.js'`.
2. Rename `formatChip` to `formatText` and update its doc comment to say "The format in words, or null".
3. After `formatText`, add:

```jsx
/**
 * The owner's copy in one line: a different kind of fact from the genre
 * chips -- this copy, not the game -- so it is kept out of them.
 *
 * @returns {string|null} "My copy: Nintendo Switch 2 · Full game on
 *   cartridge · Complete in box", "Wanted for …" / "On my want list" for the
 *   want list, or null when nothing about the copy is known.
 */
function copyLine(item) {
  if (item.wanted) {
    return item.platform ? `Wanted for ${item.platform}` : 'On my want list'
  }
  const parts = [
    item.platform,
    formatText(item),
    COMPLETENESS_LABEL[item.completeness],
  ].filter(Boolean)
  return parts.length > 0 ? `My copy: ${parts.join(' · ')}` : null
}
```

4. `Tiles`:
   - The signature becomes `function Tiles({ item, detail })`.
   - `<dt>Your rating</dt>` becomes `<dt>My rating</dt>`.
   - Each of the Community, Time to beat and Played tiles is additionally conditioned on `detail`, as in `{detail && item.community_score != null && (…)}`.
   - Update the doc comment to: "My rating always; the community, length and play history only with the detail response, which the snapshot preview does not have."
5. Replace `ItemPage` with the code below. It moves the ready branch's JSX into `ItemView` unchanged, apart from the chips, the copy line and the `detail` conditions.

```jsx
function ItemPage({ id }) {
  const { signedIn = false } = useOutletContext() ?? {}
  const [result, setResult] = useState({ state: 'loading', item: null })
  const [preview, setPreview] = useState(null)
  const [slow, setSlow] = useState(false)
  const [expanded, setExpanded] = useState(false)

  /**
   * Loads the item and returns what to show; the effect applies it, since
   * setting state in an effect body is what react-hooks forbids.
   */
  const load = useCallback(async () => {
    try {
      const response = await apiFetch(
        `/api/public/items/${encodeURIComponent(id)}`,
      )
      if (response.status === 404) return { state: 'missing', item: null }
      if (!response.ok) return { state: 'error', item: null }
      return { state: 'ready', item: await response.json() }
    } catch {
      return { state: 'error', item: null }
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => setSlow(true), 2000)
    // The card-level fields from the build-time snapshot, painted while the
    // API wakes. The API stays authoritative: its 404 wins over a snapshot
    // taken before the item was unpublished.
    readSnapshot('items').then((items) => {
      const match = items?.find((entry) => entry.id === id)
      if (!cancelled && match) setPreview(match)
    })
    load()
      .then((next) => {
        if (!cancelled) setResult(next)
      })
      .finally(() => clearTimeout(timer))
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [id, load])

  if (result.state === 'missing') return <NotFound />

  if (result.state === 'ready') {
    return (
      <ItemView
        item={result.item}
        detail
        signedIn={signedIn}
        expanded={expanded}
        onToggleDescription={() => setExpanded((current) => !current)}
      />
    )
  }

  if (preview) {
    return (
      <ItemView
        item={preview}
        detail={false}
        signedIn={signedIn}
        note={
          result.state === 'error'
            ? 'More detail could not be loaded. Try again shortly.'
            : null
        }
      />
    )
  }

  if (result.state === 'loading') {
    return (
      <section>
        <p className="muted" role="status">
          {slow
            ? 'Waking the server — it sleeps when idle, so this takes about thirty seconds.'
            : 'Loading…'}
        </p>
      </section>
    )
  }

  return (
    <section>
      <p className="admin-error">
        This item could not be loaded. Try again shortly.
      </p>
    </section>
  )
}

/**
 * The page body for one item.
 *
 * `detail` is false for a snapshot preview: a list row, without the
 * description, the similar strip or the detail-only tiles, which appear when
 * the API answers.
 */
function ItemView({
  item,
  detail,
  signedIn,
  note = null,
  expanded = false,
  onToggleDescription,
}) {
  const meta = [item.year, item.creator].filter(Boolean).join(' · ')
  const description =
    detail && item.description ? plainText(item.description) : ''
  const themes = item.themes ?? []
  const otherPlatforms = (item.platforms ?? []).filter(
    (platform) => platform !== item.platform,
  )
  const copy = copyLine(item)
  const chips = [
    // What the game is, then where else it exists. The copy on the shelf
    // has its own line.
    ...item.genres.map((genre) => [`genre-${genre}`, genre, false]),
    ...themes.map((theme) => [`theme-${theme}`, theme, true]),
    ...otherPlatforms.map((platform) => [
      `platform-${platform}`,
      platform,
      true,
    ]),
  ]
  const similar = detail ? (item.similar_in_collection ?? []) : []

  return (
    <article className="item-page">
      <div className="item-hero" data-empty={!item.cover_url || undefined}>
        {item.cover_url && (
          <img className="item-hero-backdrop" src={item.cover_url} alt="" />
        )}
      </div>

      <header className="item-head">
        <div className="item-cover">
          <CoverImage src={item.cover_url} type={item.type} alt="" />
        </div>
        <div className="item-heading">
          <h1>{item.title}</h1>
          {meta && <p className="muted">{meta}</p>}
          <p className="item-status" data-status={item.status}>
            {statusInWords(item)}
          </p>
          {copy && <p className="item-copy">{copy}</p>}
          {signedIn && (
            <Link to={`/admin/collection/${item.id}`} className="item-edit">
              Edit
            </Link>
          )}
        </div>
      </header>

      {chips.length > 0 && (
        <ul className="item-chips">
          {chips.map(([key, label, muted]) => (
            <li
              key={key}
              className={muted ? 'item-chip item-chip-muted' : 'item-chip'}
            >
              {label}
            </li>
          ))}
        </ul>
      )}

      {description && (
        <div className="item-description-wrap">
          <p
            className={
              expanded ? 'item-description' : 'item-description clamp-6'
            }
          >
            {description}
          </p>
          {/* Always offered: overflow cannot be measured before layout, and a
              button that changes nothing on a short text is harmless. */}
          <button
            type="button"
            className="link-button"
            aria-expanded={expanded}
            onClick={onToggleDescription}
          >
            {expanded ? 'Less' : 'More'}
          </button>
        </div>
      )}

      <Tiles item={item} detail={detail} />

      {note && <p className="admin-error">{note}</p>}

      {similar.length > 0 && (
        <section className="item-similar" aria-label="More from this shelf">
          <h2>More from this shelf</h2>
          <PosterGrid
            items={similar}
            size="compact"
            renderCard={(card) => (
              <PosterCard item={card} to={`/collection/${card.id}`} />
            )}
          />
        </section>
      )}
    </article>
  )
}
```

Append to `frontend/src/index.css`, after the `.item-chips` rule block:

```css
/* The owner's copy: its own line, not a chip among the game's genres. */
.item-copy {
  color: var(--text-body);
  font-size: 0.9375rem;
  margin: 0.25rem 0 0;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd frontend && npx vitest run src/pages/Item.test.jsx`
Expected: all pass.

- [ ] **Step 5: Format, lint, full suite**

Run: `cd frontend && npx prettier --write src/pages/Item.jsx src/pages/Item.test.jsx src/index.css && npx eslint src && npm test`

- [ ] **Step 6: Sweep for second person.** Run `grep -rniE "\byou(r)?\b" frontend/src/pages/{Home,About,Projects,Blog,BlogPost,Collection,Item,NotFound}.jsx frontend/src/components/{CoverStrip,PosterCard,PosterGrid,FilterChips,ShelfToolbar,SortControl,Stars}.jsx`. The only hit allowed is `FavoritesRow`'s "Pick your favourites", which renders with `placeholders` only and is admin-only.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Item.jsx frontend/src/pages/Item.test.jsx frontend/src/index.css
git commit -m "feat(item): first-person rating, a My copy line, and a snapshot preview"
```

**Zone 1 exit:**
- Run the self code review from execution.md (checklist ✅/❌). Fix every ❌.
- Present `git log --oneline <zone-start>..HEAD` with per-commit files and rationale.
- Write the zone-exit notifier file if `~/.claude/hooks/zone-exit-notifier/` exists.
- **STOP.**

---

## Zone 2 — build and CI (deploy path)

Zone-start SHA: record it before Task 9.

### Task 9: `fetch-snapshot.mjs` in the build

**Files:**
- Create: `frontend/scripts/fetch-snapshot.mjs`
- Test: `frontend/scripts/fetch-snapshot.test.mjs`
- Create: `frontend/scripts/README.md`
- Modify: `frontend/package.json` (`build`, new `snapshot`)
- Modify: `.gitignore` (root)

**Interfaces:**
- Produces:
  - `fetchSnapshot({ apiUrl, outDir, fetchImpl, sleep, now, log }): Promise<'skipped' | 'written' | 'failed'>`
  - `SNAPSHOTS`: `{ [name]: { path: string, valid: (body) => boolean, required: boolean } }`. Task 18 appends the optional `picks` and `radar` entries.

- [ ] **Step 1: Write the failing test** — `frontend/scripts/fetch-snapshot.test.mjs`:

```js
// @vitest-environment node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSnapshot } from './fetch-snapshot.mjs'

const API = 'https://api.example.test'
const ITEMS = [{ id: '1', title: 'Hades' }]
const STATS = { total: 1, by_status: { finished: 1 } }

let outDir

beforeEach(async () => {
  outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'snapshot-'))
})

afterEach(async () => {
  await fs.rm(outDir, { recursive: true, force: true })
})

const ok = (body) => ({ ok: true, status: 200, json: async () => body })

/** A fetch answering by path; anything unlisted is a 404. */
function api(routes) {
  return vi.fn(async (url) => {
    const route = routes[new URL(url).pathname]
    if (route instanceof Error) throw route
    return route ?? { ok: false, status: 404, json: async () => ({}) }
  })
}

function run(fetchImpl, overrides = {}) {
  let clock = 0
  return fetchSnapshot({
    apiUrl: API,
    outDir,
    fetchImpl,
    sleep: async (ms) => {
      clock += ms
    },
    now: () => clock,
    log: () => {},
    ...overrides,
  })
}

async function written() {
  return (await fs.readdir(outDir)).sort()
}

describe('fetchSnapshot', () => {
  it('does nothing without an API URL, so CI builds stay offline', async () => {
    const fetchImpl = api({})
    expect(await run(fetchImpl, { apiUrl: '' })).toBe('skipped')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await written()).toEqual([])
  })

  it('wakes the API, then writes each body verbatim', async () => {
    const fetchImpl = api({
      '/api/health': ok({ status: 'ok' }),
      '/api/public/items': ok(ITEMS),
      '/api/public/stats': ok(STATS),
    })
    expect(await run(fetchImpl)).toBe('written')
    expect(await written()).toEqual(['items.json', 'stats.json'])
    expect(
      JSON.parse(await fs.readFile(path.join(outDir, 'items.json'), 'utf8')),
    ).toEqual(ITEMS)
    expect(
      JSON.parse(await fs.readFile(path.join(outDir, 'stats.json'), 'utf8')),
    ).toEqual(STATS)
  })

  it('keeps polling health while the API sleeps', async () => {
    let calls = 0
    const fetchImpl = vi.fn(async (url) => {
      const { pathname } = new URL(url)
      if (pathname === '/api/health') {
        calls += 1
        return calls < 3 ? { ok: false, status: 503 } : ok({ status: 'ok' })
      }
      return pathname === '/api/public/items' ? ok(ITEMS) : ok(STATS)
    })
    expect(await run(fetchImpl)).toBe('written')
    expect(calls).toBe(3)
  })

  it('gives up after the wake budget and writes nothing', async () => {
    const fetchImpl = api({ '/api/health': new TypeError('connect refused') })
    expect(await run(fetchImpl)).toBe('failed')
    expect(await written()).toEqual([])
  })

  it('writes neither file when one body has the wrong shape', async () => {
    const fetchImpl = api({
      '/api/health': ok({ status: 'ok' }),
      '/api/public/items': ok(ITEMS),
      '/api/public/stats': ok([]),
    })
    expect(await run(fetchImpl)).toBe('failed')
    expect(await written()).toEqual([])
  })

  it('never rejects, whatever the API does', async () => {
    const fetchImpl = api({
      '/api/health': ok({ status: 'ok' }),
      '/api/public/items': new TypeError('socket hang up'),
    })
    await expect(run(fetchImpl)).resolves.toBe('failed')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run scripts/fetch-snapshot.test.mjs`
Expected: FAIL. The import of `./fetch-snapshot.mjs` can't be resolved.

- [ ] **Step 3: Implement** — `frontend/scripts/fetch-snapshot.mjs`:

```js
/**
 * Writes the public collection's build-time snapshot to public/collection/.
 *
 * Runs first in `npm run build`, before `vite build` copies public/ into
 * dist/. The free-tier API sleeps, so /collection would otherwise greet a
 * first-time visitor with a thirty-second wake-up; with these files it
 * paints at once and refreshes from the API when it wakes.
 *
 * Only runs where VITE_API_URL is set, which is the Render static site: CI
 * and local builds stay offline and deterministic (`npm run snapshot` fetches
 * from production on purpose). It never fails the build -- a sleeping or
 * broken API ships a build without a snapshot, which behaves exactly like
 * the site before the snapshot existed.
 *
 * The bodies are written verbatim, so every consumer parses them with the
 * code that parses the API. See scripts/README.md.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The snapshots, the endpoint each copies, the shape it must have, and
 * whether the build can go without it. A required snapshot that fails fails
 * them all; an optional one is only left out.
 */
export const SNAPSHOTS = {
  items: { path: '/api/public/items', valid: Array.isArray, required: true },
  stats: {
    path: '/api/public/stats',
    valid: (body) => isObject(body) && 'total' in body,
    required: true,
  },
}

const WAKE_BUDGET_MS = 120_000
const WAKE_INTERVAL_MS = 5_000
const REQUEST_TIMEOUT_MS = 30_000

async function getJson(fetchImpl, url) {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response.json()
}

/** Polls /api/health until it answers OK or the budget runs out. */
async function wake({ apiUrl, fetchImpl, sleep, now }) {
  const deadline = now() + WAKE_BUDGET_MS
  while (now() < deadline) {
    try {
      const response = await fetchImpl(`${apiUrl}/api/health`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (response.ok) return true
    } catch {
      // Asleep or unreachable: wait and ask again.
    }
    await sleep(WAKE_INTERVAL_MS)
  }
  return false
}

/**
 * Fetches every snapshot and writes the ones that validated.
 *
 * @param {object} options
 * @param {string|undefined} options.apiUrl API origin, no trailing slash.
 * @param {string} options.outDir Directory to write `{name}.json` into.
 * @param {typeof fetch} [options.fetchImpl]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @param {() => number} [options.now] Milliseconds, for the wake budget.
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<'skipped'|'written'|'failed'>} Never rejects.
 */
export async function fetchSnapshot({
  apiUrl,
  outDir,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  now = Date.now,
  log = console.log,
}) {
  if (!apiUrl) {
    log('snapshot: no API URL set; building without one')
    return 'skipped'
  }
  if (!(await wake({ apiUrl, fetchImpl, sleep, now }))) {
    log(`snapshot: ${apiUrl} did not wake in time; building without one`)
    return 'failed'
  }
  const bodies = {}
  for (const [name, snapshot] of Object.entries(SNAPSHOTS)) {
    try {
      const body = await getJson(fetchImpl, `${apiUrl}${snapshot.path}`)
      if (!snapshot.valid(body)) {
        throw new Error(`${snapshot.path} returned an unexpected shape`)
      }
      bodies[name] = body
    } catch (error) {
      if (snapshot.required) {
        log(`snapshot: ${error.message}; building without one`)
        return 'failed'
      }
      log(`snapshot: ${error.message}; leaving ${name} out`)
    }
  }
  try {
    await fs.mkdir(outDir, { recursive: true })
    for (const [name, body] of Object.entries(bodies)) {
      await fs.writeFile(path.join(outDir, `${name}.json`), JSON.stringify(body))
    }
  } catch (error) {
    log(`snapshot: could not write (${error.message}); building without one`)
    return 'failed'
  }
  log(
    `snapshot: wrote ${Object.keys(bodies).join(', ')} (${bodies.items.length} items)`,
  )
  return 'written'
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const apiUrl = (
    process.env.SNAPSHOT_API_URL ??
    process.env.VITE_API_URL ??
    ''
  ).replace(/\/$/, '')
  await fetchSnapshot({
    apiUrl,
    outDir: path.join(here, '..', 'public', 'collection'),
  })
}
```

In `frontend/package.json`, the scripts become:

```json
    "build": "node scripts/fetch-snapshot.mjs && vite build && node scripts/generate-rss.mjs",
    "snapshot": "SNAPSHOT_API_URL=https://api.joey-haas.dev node scripts/fetch-snapshot.mjs",
```

Append to the root `.gitignore`:

```
# Build-time snapshot of the public collection, written by
# frontend/scripts/fetch-snapshot.mjs. Fetched per build, never committed:
# unpublishing an item should not leave it in git history.
frontend/public/collection/
```

Create `frontend/scripts/README.md`:

````markdown
# Build scripts

Two Node scripts run around `vite build` (`npm run build`):

```
fetch-snapshot.mjs  →  vite build  →  generate-rss.mjs
```

## fetch-snapshot.mjs

**What and why.** It writes the public API's response bodies to
`public/collection/items.json` and `stats.json`, which Vite then copies into
`dist/`. The API is on Render's free tier and sleeps after about 15 idle
minutes. Without the snapshot, `/collection` would open with a thirty-second
"Waking the server" notice. With it, the page paints straight away and then
refreshes from the API. Home and Projects read the same file for their cover
strips, so they still make no API calls.

**When it runs.**
- Only when `VITE_API_URL` is set, which is the Render static site. CI and
  local builds skip it, so they stay offline and deterministic.
- It never fails the build. If the API doesn't wake within 120 s, or returns
  something unexpected, the build ships without a snapshot, and the site
  behaves as it did before the snapshot existed.
- Required snapshots (`items`, `stats`) are written together or not at all.

**Usage.**

```bash
npm run snapshot   # fetch from production into public/collection/ for local dev
npm run build      # on Render: snapshot, then vite build, then the RSS feed
```

**Refreshing.** Every deploy refreshes the snapshot. Between deploys,
`.github/workflows/snapshot.yml` runs daily and triggers a static-site deploy
through a Render deploy hook, but only when the live API bodies differ from
the deployed files. See the root README → Collection snapshot.

**Gotchas.**
- `public/collection/` is gitignored and must never be committed.
- The files are verbatim API bodies. Change what the API publishes and you
  change what the snapshot publishes, so `test_public.py` covers both.

## generate-rss.mjs

It writes `dist/feed.xml` from the frontmatter in `frontend/posts/`, skipping
drafts. It reads frontmatter only and never renders post HTML, so it can't
disagree with the site about how a post renders. It runs after `vite build`,
because it writes into `dist/`.
````

- [ ] **Step 4: Run it and watch it pass, then check the build offline**

Run: `cd frontend && npx vitest run scripts/fetch-snapshot.test.mjs && npm run build`
Expected: 6 passed. The build logs `snapshot: no API URL set; building without one` and succeeds, and `ls dist/collection` fails because nothing was written.

- [ ] **Step 5: Check the script against production.** Its requests are read-only and go to public endpoints.

Run: `cd frontend && npm run snapshot && ls -la public/collection && node -e "console.log(JSON.parse(require('fs').readFileSync('public/collection/items.json','utf8')).length)"`
Expected: `snapshot: wrote items, stats (N items)`, and N matches the public shelf. Then `git status --short` must not list `public/collection`.

- [ ] **Step 6: Format, lint, full suite, then commit**

Run: `cd frontend && npx prettier --write scripts/fetch-snapshot.mjs scripts/fetch-snapshot.test.mjs scripts/README.md package.json && npx eslint scripts && npm test`

```bash
git add frontend/scripts/fetch-snapshot.mjs frontend/scripts/fetch-snapshot.test.mjs frontend/scripts/README.md frontend/package.json .gitignore
git commit -m "build(frontend): write a snapshot of the public collection at build time"
```

---

### Task 10: `snapshot.yml` and the README

**Files:**
- Create: `.github/workflows/snapshot.yml`
- Modify: `README.md` (root; add a "Collection snapshot" section next to the deploy section)

- [ ] **Step 1: Write the workflow** — `.github/workflows/snapshot.yml`:

```yaml
name: Snapshot

# Keeps the build-time snapshot of the public collection within a day of
# production. The Render build fetches the snapshot itself
# (frontend/scripts/fetch-snapshot.mjs); this workflow only asks Render to
# rebuild the static site when the live API bodies differ from the deployed
# files. It never pushes: main is protected, and the snapshot is not
# committed.
on:
  schedule:
    # Off the hour: GitHub delays scheduled runs at the top of the hour.
    - cron: '23 9 * * *'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: snapshot
  cancel-in-progress: false

env:
  SITE_URL: https://joey-haas.dev
  API_URL: https://api.joey-haas.dev

jobs:
  refresh:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Wake the API
        run: |
          for attempt in $(seq 1 24); do
            if curl -fsS -m 30 "$API_URL/api/health" > /dev/null; then
              echo "API awake after $attempt attempt(s)"
              exit 0
            fi
            sleep 5
          done
          echo "::error::The API did not wake within two minutes"
          exit 1

      - name: Compare the API with the deployed snapshot
        id: compare
        run: |
          changed=""
          for name in items stats; do
            curl -fsS -m 60 "$API_URL/api/public/$name" | jq -S . > "live-$name.json"
            # A missing file is served as index.html, which jq rejects: that
            # counts as changed, so the first run deploys one.
            if curl -fsS -m 60 "$SITE_URL/collection/$name.json" -o "deployed-$name.raw" &&
              jq -S . "deployed-$name.raw" > "deployed-$name.json" 2> /dev/null &&
              cmp -s "live-$name.json" "deployed-$name.json"; then
              echo "$name: unchanged"
            else
              echo "$name: changed or missing"
              changed="$changed $name"
            fi
          done
          echo "changed=${changed# }" >> "$GITHUB_OUTPUT"

      - name: Trigger a static-site deploy
        if: steps.compare.outputs.changed != ''
        env:
          CHANGED: ${{ steps.compare.outputs.changed }}
          RENDER_DEPLOY_HOOK_URL: ${{ secrets.RENDER_DEPLOY_HOOK_URL }}
        run: |
          if [ -z "$RENDER_DEPLOY_HOOK_URL" ]; then
            echo "::error::The RENDER_DEPLOY_HOOK_URL secret is not set"
            exit 1
          fi
          curl -fsS -m 30 -X POST "$RENDER_DEPLOY_HOOK_URL" > /dev/null
          echo "Deploy triggered; changed: $CHANGED" >> "$GITHUB_STEP_SUMMARY"

      - name: Report no change
        if: steps.compare.outputs.changed == ''
        run: echo "Snapshot unchanged; no deploy" >> "$GITHUB_STEP_SUMMARY"
```

- [ ] **Step 2: Validate the workflow.**
  - Check that it parses: `cd frontend && node -e "require('js-yaml').load(require('fs').readFileSync('../.github/workflows/snapshot.yml','utf8')); console.log('ok')"`. `js-yaml` is already installed through `gray-matter`.
  - If `command -v actionlint` finds it, also run `actionlint .github/workflows/snapshot.yml`.
  - Expected: `ok`, and no actionlint findings.

- [ ] **Step 3: Dry-run the compare step locally** against production. Its requests are read-only.

```bash
cd "$(mktemp -d)" && SITE_URL=https://joey-haas.dev API_URL=https://api.joey-haas.dev GITHUB_OUTPUT=/dev/stdout bash -c 'changed=""; for name in items stats; do curl -fsS -m 60 "$API_URL/api/public/$name" | jq -S . > "live-$name.json"; if curl -fsS -m 60 "$SITE_URL/collection/$name.json" -o "deployed-$name.raw" && jq -S . "deployed-$name.raw" > "deployed-$name.json" 2> /dev/null && cmp -s "live-$name.json" "deployed-$name.json"; then echo "$name: unchanged"; else echo "$name: changed or missing"; changed="$changed $name"; fi; done; echo "changed=${changed# }" >> "$GITHUB_OUTPUT"'
```

Expected: `items: changed or missing`, `stats: changed or missing`, `changed=items stats`. No snapshot is deployed yet, so both are missing.

- [ ] **Step 4: README.** In the root `README.md`, add after the deploy section:

````markdown
## Collection snapshot

`/collection` first paints a snapshot of the public API, then refreshes it
from the live API, so a first-time visitor doesn't wait for the free-tier
backend to wake. Home and Projects read the same file for their cover
strips.

- **Written by** the Render static build: `frontend/scripts/fetch-snapshot.mjs`
  runs first in `npm run build`, and only where `VITE_API_URL` is set. See
  `frontend/scripts/README.md`.
- **Refreshed by** every deploy, plus `.github/workflows/snapshot.yml`. It runs
  daily at 09:23 UTC and on demand from the Actions tab, compares the live API
  bodies with the deployed `/collection/*.json`, and triggers a static-site
  deploy only when they differ. It never pushes, and the snapshot is never
  committed.
- **Setup (once):** in Render, go to the static site → Settings → Deploy Hook
  and copy the URL. In GitHub, go to Settings → Secrets and variables →
  Actions and add it as `RENDER_DEPLOY_HOOK_URL`. The URL is a secret: anyone
  who has it can trigger deploys.
- **Gotcha:** GitHub switches off scheduled workflows in a public repository
  after 60 days with no repository activity. If the snapshot stops refreshing
  after a quiet spell, re-enable the workflow from the Actions tab.
- **The API is not redeployed** by any of this. Its `rootDir` is `backend`, so
  Render deploys it only for changes under `backend/`.
````

- [ ] **Step 5: Format and commit**

Neither file is under `frontend/`, where CI runs Prettier, and running Prettier on the root README would reflow sections this task doesn't touch. So there is no formatter step: the YAML parse check in Step 2 is the gate. Check `git diff README.md` and confirm it adds only the new section.

```bash
git add .github/workflows/snapshot.yml README.md
git commit -m "ci: rebuild the static site daily when the public collection changes"
```

---

### Task 11: `smoke.sh` and `CLAUDE.md` tell the truth about API calls

**Files:**
- Modify: `scripts/smoke.sh`
- Modify: `CLAUDE.md`

- [ ] **Step 1: smoke.sh**

After `report_fail`, add:

```bash
warn=0

report_warn() {
  printf 'WARN  %-42s %s\n' "$1" "$2"
  warn=$((warn + 1))
}
```

Move the existing private-key regex into a variable, placed before its first use. Keep the text exactly as it is now:

```bash
PRIVATE_KEYS='"(notes|owned_format|is_public|source_metadata|similar_games|external_source|external_id|cart_id|format_source|region|acquired_at|pinned_at|store_listings|physical_editions|catalogue_[a-z_]*|price|snapshot|format_route|listing_ids|batch_id|based_on|reason_source|store_lines|hypes|ranked_by|model_note|based_on_titles|buyable|recommendation[a-z_]*)"'
```

Change the items check to `grep -qE "$PRIVATE_KEYS"`.

Replace the comment `# The public collection routes are the only unauthenticated ones, and the only part of the public site that calls the API at all.` with:

```bash
# The public collection routes are the only unauthenticated data routes.
# /collection and /collection/:id are the only pages that fetch them; every
# page also asks /api/auth/me once (RootLayout) and treats failure as signed
# out. Home and Projects read the static snapshot below, never the API.
```

After the public-stats checks, add:

```bash
# The build-time snapshot (frontend/scripts/fetch-snapshot.mjs). A build
# whose fetch failed ships without one, and the site then behaves as it did
# before the snapshot existed, so absence is a warning. A snapshot that is
# present must be JSON and must hold nothing the API itself would not publish.
snapshot_check() {
  local name="$1" url="$SITE_URL/collection/$1.json" type body
  type="$(curl -s -o /dev/null -m 90 -w '%{content_type}' "$url")"
  case "$type" in
    application/json*) ;;
    *)
      report_warn "snapshot $name.json" "not deployed (got '${type:-no response}')"
      return
      ;;
  esac
  body="$(curl -s -m 90 "$url")"
  if printf '%s' "$body" | grep -qE "$PRIVATE_KEYS"; then
    report_fail "snapshot $name.json" "found a private key"
  else
    report_pass "snapshot $name.json" "JSON, public fields only"
  fi
}

for name in items stats; do
  snapshot_check "$name"
done
```

Replace the comment `# Proves the public pages were actually decoupled from the backend, rather than merely appearing decoupled.` with `# Proves the public pages ship their own content, rather than fetching the retired /api/projects.`

Change the summary to:

```bash
echo "$pass passed, $fail failed, $warn warned"
```

- [ ] **Step 2: Run smoke against production.** The current deploy has no snapshot, so this proves the warn path and that no existing check regressed.

Run: `bash -n scripts/smoke.sh && ./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`
Expected: every existing check PASS, two `WARN  snapshot … not deployed (got 'text/html')` lines, `N passed, 0 failed, 2 warned`, exit 0.

- [ ] **Step 3: CLAUDE.md.** Make the three edits below.

First edit — in Architecture, replace:

```
Public pages other than `/collection` make no API calls
  — bio and project content are static modules in `frontend/src/content/`, so
  the site renders fully while the free-tier backend is asleep.
```

with:

```
Public pages other than `/collection*` make no API calls
  — bio and project content are static modules in `frontend/src/content/`, so
  the site renders fully while the free-tier backend is asleep. Home and
  Projects may read `/collection/items.json`, the build-time snapshot: a
  static file on the site's own origin, not an API call.
```

Second edit — in Media tracker, replace the bullet beginning `` `/collection` is public and **does** call the API`` with:

```
- `/collection` and `/collection/:id` are public and **do** call the API,
  unlike every other public page. They paint the build-time snapshot first
  (`frontend/public/collection/*.json`, written by
  `frontend/scripts/fetch-snapshot.mjs` on Render and refreshed daily by
  `.github/workflows/snapshot.yml` through a deploy hook), then swap in live
  data; "Waking the server" shows only when there is no snapshot. The
  snapshot is gitignored and never committed. See README → Collection
  snapshot.
```

Third edit — in Conventions, after the `FilterChips` bullet if one exists, otherwise after the shelf-components bullet, add:

```
- `FilterChips` hides a group with at most one chip to show and none
  pressed, on both shelves; a pressed chip always keeps its group.
```

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke.sh CLAUDE.md
git commit -m "docs(smoke): say which pages call the API, and check the snapshot"
```

**Zone 2 exit, which is also the PR1 finish gate:**
1. Mechanical preflight:
   - `cd frontend && npm run format:check && npm run lint && npm test && npm run build`
   - `cd backend && ./.venv/bin/ruff format --check . && ./.venv/bin/ruff check . && ./.venv/bin/pytest -q`
   - The backend is untouched, but the gate runs both suites.
2. **Ultra review**, because PR1 touches 4+ files and CI/deploy surface. One parallel reviewer per dimension: plan alignment, correctness, security, performance, tests, dead code. An independent agent then verifies every finding adversarially. Fix what's confirmed, in boundary commits.
3. Draft the PR description: summary, spec link, the Spec changes it enacts (4 only), and the owner's setup steps (the Render deploy hook, the GitHub secret, the open questions from the spec).
4. Write the zone-exit notifier file, present the batch review, then **STOP**.

**Owner, after approving:**
- Merge `refresh-site-copy` first if it should land separately.
- Push `tracker-showcase` and open PR1.
- Confirm the static site has a deploy hook. If it doesn't, stop and tell me: the workflow then needs the Render API deploy endpoint instead. That is a plan change.
- Add `RENDER_DEPLOY_HOOK_URL`.
- Merge, then run `snapshot.yml` from the Actions tab.
- Give me the go for PR1's environment tests (below).

---

# PR2 — Public read-only outputs (branch `tracker-showcase-public`)

The branch is cut from `main` **after PR1 merges**. It is created with `git switch -c tracker-showcase-public origin/main` after the owner's pull. This repo lives under `~/Developer/`, not `~/repos/`, so the worktree rule does not apply.

## Zone 3 — backend and frontend code

Zone-start SHA: record it before Task 12.

### Task 12: First-person reasons

**Files:**
- Modify: `backend/picker.py:419-425`
- Test: `backend/tests/test_picker.py:572-577`

- [ ] **Step 1: Update the pin so it fails.** In `test_a_rated_reference_is_named_with_its_rating`, change `"…with Inscryption, which you rated 9"` to `"…with Inscryption, which I rated 9"`.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend && ./.venv/bin/pytest tests/test_picker.py -k rated_reference -q`
Expected: FAIL, because the reason still says "which you rated 9".

- [ ] **Step 3: Implement.** In `picker.py`, change `_named`:

```python
def _named(reference: PickerItem) -> str:
    """ "Hades ♥" for a favourite, "Celeste, which I rated 9" when rated.

    First person everywhere (showcase spec, K9): the owner reads it in admin,
    and the public reads it under Recent picks.
    """
    if reference.favorite:
        return f"{reference.title} ♥"
    if reference.rating is not None:
        return f"{reference.title}, which I rated {reference.rating}"
    return reference.title
```

- [ ] **Step 4: Run it and watch it pass, then run the full suite.** Radar and Discover reuse `_named`.

Run: `cd backend && ./.venv/bin/ruff format picker.py tests/test_picker.py && ./.venv/bin/ruff check . && ./.venv/bin/pytest -q`
Expected: all pass. If any other test pins "which you rated", update it the same way, and **STOP** if that takes more than two more files.

- [ ] **Step 5: Commit**

```bash
git add backend/picker.py backend/tests/test_picker.py
git commit -m "feat(picker): write reasons in the first person"
```

---

### Task 13: `picker.public_reasons`

**Files:**
- Modify: `backend/picker.py` (a new `MAX_REASONS`, `_common_reasons` and `public_reasons`; `recommend` uses them)
- Test: `backend/tests/test_picker.py`

**Interfaces:**
- Produces: `public_reasons(item: PickerItem, profile: list[PickerItem]) -> tuple[str, ...]`. It returns at most `MAX_REASONS` (3) reasons, drawn only from overlap, similarity and length.

- [ ] **Step 1: Write the failing tests.** Append to `backend/tests/test_picker.py`, and add `public_reasons` to the `from picker import (...)` list:

```python
def test_public_reasons_draw_on_the_given_profile_only():
    # "secret" shares more with the candidate than Hades does, so the full
    # profile would name it; the public profile leaves it out.
    hades = item("hades", favorite=True, genres=("Roguelike", "Indie"))
    secret = item(
        "secret",
        title="Secret Game",
        rating=10,
        status="finished",
        genres=("Roguelike", "Indie"),
        themes=("Fantasy",),
    )
    candidate = item(
        "dead", title="Dead Cells", genres=("Roguelike", "Indie"), themes=("Fantasy",)
    )

    full = public_reasons(candidate, [hades, secret, candidate])
    public = public_reasons(candidate, [hades, candidate])

    assert any("Secret Game" in reason for reason in full)
    # Equal weights and one kind, so the shared genres sort by name.
    assert "Shares Indie and Roguelike with Hades ♥" in public
    assert not any("Secret Game" in reason for reason in public)


def test_public_reasons_leave_out_the_slot_reasons():
    candidate = item(
        "old",
        acquired_at=date(2020, 1, 1),
        started_at=date(2026, 1, 1),
        release_date=date(1998, 11, 21),
        time_to_beat_hours=4.0,
    )

    reasons = public_reasons(candidate, [candidate])

    assert reasons == ("About 4 h — a short one",)
    assert not any(
        phrase in reason
        for reason in reasons
        for phrase in ("On the shelf since", "Started in", "Out since")
    )


def test_public_reasons_are_first_person_and_capped():
    rated = item(
        "celeste",
        title="Celeste",
        rating=9,
        status="finished",
        external_id="1",
        genres=("Platform",),
        similar_games=("2",),
    )
    candidate = item(
        "sunshine",
        title="Sunshine",
        external_id="2",
        genres=("Platform",),
        time_to_beat_hours=10.0,
    )

    reasons = public_reasons(candidate, [rated, candidate])

    assert "IGDB lists it beside Celeste, which I rated 9" in reasons
    assert len(reasons) <= 3
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd backend && ./.venv/bin/pytest tests/test_picker.py -k public_reasons -q`
Expected: FAIL with `ImportError: cannot import name 'public_reasons'`.

- [ ] **Step 3: Implement.** In `picker.py`, next to `REASON_KINDS`:

```python
MAX_REASONS = 3
```

After `_is_stalled`:

```python
def _common_reasons(
    item: PickerItem,
    references: list[PickerItem],
    weights: dict[str, float],
    table: dict[tuple[str, str], float],
    similar_to: PickerItem | None,
) -> list[str | None]:
    """The reasons every pick can carry: overlap, IGDB similarity, length."""
    return [
        _overlap_reason(item, references, weights, table),
        f"IGDB lists it beside {_named(similar_to)}" if similar_to else None,
        _length_reason(item),
    ]


def public_reasons(item: PickerItem, profile: list[PickerItem]) -> tuple[str, ...]:
    """A pick's reasons for the public page (showcase spec, D).

    `profile` must hold public rows only: every game a reason can name is
    drawn from it, so a private game is never named. The slot reasons are
    left out -- "On the shelf since" is read from acquired_at, which is
    private; "Started in ... not touched since" reports activity; "Out since"
    means nothing without its slot.
    """
    weights = reference_weights(profile)
    references = [entry for entry in profile if entry.id in weights]
    table = attribute_table(profile, weights)
    _score, similar_to = similarity(item, references, weights)
    reasons = _common_reasons(item, references, weights, table, similar_to)
    return tuple(reason for reason in reasons if reason)[:MAX_REASONS]
```

In `recommend`, replace the `reasons = [ … ]` list with `reasons = _common_reasons(item, references, weights, table, similar_to)`, and replace `[:3]` with `[:MAX_REASONS]`.

The first test fixes the genre order. `_overlap_reason` sorts shared pairs by table weight, then by kind (`REASON_KINDS` order), then case-folded name. Both genres carry Hades' weight, so they sort by name: "Indie", then "Roguelike". If the run shows the full profile naming the secret game through a theme rather than a genre, that is still correct. The first assertion only needs "Secret Game" to appear somewhere in `full`.

- [ ] **Step 4: Run it and watch it pass, then run the full suite**

Run: `cd backend && ./.venv/bin/ruff format picker.py tests/test_picker.py && ./.venv/bin/ruff check . && ./.venv/bin/pytest -q`
Expected: all pass. `recommend`'s behaviour is unchanged, which the existing picker tests prove.

- [ ] **Step 5: Commit**

```bash
git add backend/picker.py backend/tests/test_picker.py
git commit -m "feat(picker): add public_reasons, built from a public-only profile"
```

---

### Task 14: `GET /api/public/picks`

**Files:**
- Create: `backend/public_outputs.py`
- Modify: `backend/public.py` (imports; route inside `create_public_router`, before `/items/{item_id}`)
- Create: `backend/tests/test_public_outputs.py`
- Modify: `backend/tests/test_public.py` (name checks cover the new model)

**Interfaces:**
- Consumes: `public_reasons` (Task 13); `to_picker_item` from `picker_routes`.
- Produces:
  - `PublicPickOut` with fields `{id, type, title, cover_url, platform, reasons}`.
  - `load_public_picks(session, now: datetime) -> list[PublicPickOut]`.
  - Constants `PICKS_WINDOW = timedelta(days=7)` and `PICKS_LIMIT = 3`.

- [ ] **Step 1: Write the failing tests** — `backend/tests/test_public_outputs.py`:

```python
"""Public picks and radar (showcase spec, D). The leak tests are the point."""

import uuid
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, time, timedelta

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient

from models import (
    Item,
    ItemStatus,
    ItemType,
    OwnedFormat,
    PickAction,
    PickEvent,
)
from public import create_public_router
from public_outputs import PublicPickOut

pytestmark = pytest.mark.asyncio

NOW = datetime.now(UTC)
# Noon yesterday, UTC: every pick event sits on one whole day, whatever the
# hour the suite runs, and within the seven-day window.
SHOWN_DAY = datetime.combine(NOW.date() - timedelta(days=1), time(12), tzinfo=UTC)

PICK_FIELDS = {"id", "type", "title", "cover_url", "platform", "reasons"}


@asynccontextmanager
async def client_for(factory):
    app = FastAPI()
    app.include_router(create_public_router(factory))
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


def _game(title: str, **fields) -> Item:
    base = dict(
        type=ItemType.GAME,
        title=title,
        status=ItemStatus.BACKLOG,
        is_public=True,
        owned_format=OwnedFormat.PHYSICAL,
        source_metadata={"genres": ["Roguelike", "Indie"]},
    )
    return Item(**{**base, **fields})


async def _add(factory, *rows):
    async with factory() as session:
        session.add_all(rows)
        await session.commit()


def _shown(item: Item, at: datetime) -> PickEvent:
    return PickEvent(item_id=item.id, action=PickAction.SHOWN, created_at=at)


def _with_ids(*items: Item) -> tuple[Item, ...]:
    for entry in items:
        entry.id = uuid.uuid4()
    return items


async def test_the_pick_model_publishes_exactly_these_fields():
    assert set(PublicPickOut.model_fields) == PICK_FIELDS


async def test_recent_picks_are_the_latest_shown_day_of_public_owned_games(
    sessionmaker_for_test,
):
    hades, pick_a, pick_b, pick_c, pick_d, older = _with_ids(
        _game("Hades", favorite=True, status=ItemStatus.FINISHED),
        _game("Alpha"),
        _game("Bravo", status=ItemStatus.ACTIVE),
        _game("Charlie"),
        _game("Delta"),
        _game("Older"),
    )
    latest = SHOWN_DAY
    await _add(sessionmaker_for_test, hades, pick_a, pick_b, pick_c, pick_d, older)
    await _add(
        sessionmaker_for_test,
        _shown(pick_a, latest - timedelta(minutes=3)),
        _shown(pick_b, latest - timedelta(minutes=2)),
        _shown(pick_c, latest - timedelta(minutes=1)),
        _shown(pick_d, latest),
        _shown(older, latest - timedelta(days=1)),
    )
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/picks")

    assert response.status_code == 200
    body = response.json()
    assert [row["title"] for row in body] == ["Delta", "Charlie", "Bravo"]
    for row in body:
        assert set(row) == PICK_FIELDS
        assert "Shares Indie and Roguelike with Hades ♥" in row["reasons"]


async def test_picks_leave_out_what_is_not_a_public_suggestion(
    sessionmaker_for_test,
):
    (
        keep,
        private,
        wanted,
        finished,
        pinned,
        never,
        skipped_after,
        skipped_before,
    ) = _with_ids(
        _game("Keep"),
        _game("Private", is_public=False),
        _game("Wanted", owned_format=OwnedFormat.NONE),
        _game("Finished", status=ItemStatus.FINISHED),
        _game("Pinned", pinned_at=NOW, status=ItemStatus.ACTIVE),
        _game("Never"),
        _game("Skipped After"),
        _game("Skipped Before"),
    )
    shown_at = SHOWN_DAY
    rows = (keep, private, wanted, finished, pinned, never, skipped_after, skipped_before)
    await _add(sessionmaker_for_test, *rows)
    await _add(
        sessionmaker_for_test,
        *(_shown(row, shown_at) for row in rows),
        PickEvent(
            item_id=never.id, action=PickAction.NEVER, created_at=shown_at - timedelta(days=40)
        ),
        PickEvent(
            item_id=skipped_after.id,
            action=PickAction.SKIPPED,
            created_at=shown_at + timedelta(minutes=1),
        ),
        PickEvent(
            item_id=skipped_before.id,
            action=PickAction.SKIPPED,
            created_at=shown_at - timedelta(days=3),
        ),
    )
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/picks")).json()

    assert sorted(row["title"] for row in body) == ["Keep", "Skipped Before"]


async def test_picks_are_empty_once_the_latest_shown_day_is_a_week_old(
    sessionmaker_for_test,
):
    # Seven days before today: the first day outside the window.
    (stale,) = _with_ids(_game("Stale"))
    await _add(sessionmaker_for_test, stale)
    await _add(sessionmaker_for_test, _shown(stale, SHOWN_DAY - timedelta(days=6)))
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/picks")
    assert response.status_code == 200
    assert response.json() == []


async def test_picks_are_empty_before_play_next_has_run(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/picks")
    assert response.json() == []


async def test_a_pick_never_names_a_private_game_or_a_private_date(
    sessionmaker_for_test,
):
    secret, candidate = _with_ids(
        _game(
            "Secret Favourite",
            is_public=False,
            favorite=True,
            rating=10,
            status=ItemStatus.FINISHED,
        ),
        _game(
            "Public Candidate",
            acquired_at=date(2019, 4, 1),
            started_at=date(2026, 1, 5),
            status=ItemStatus.ACTIVE,
        ),
    )
    await _add(sessionmaker_for_test, secret, candidate)
    await _add(sessionmaker_for_test, _shown(candidate, SHOWN_DAY))
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/picks")

    assert [row["title"] for row in response.json()] == ["Public Candidate"]
    for leaked in ("Secret Favourite", "On the shelf since", "April 2019", "Started in"):
        assert leaked not in response.text
```

In `backend/tests/test_public.py`, add `from public_outputs import PublicPickOut` and replace the model tuple in both name tests with `PUBLIC_MODELS`:

```python
# Every public response model. A new one goes here, so the name checks below
# cover it.
PUBLIC_MODELS = (PublicItemOut, PublicItemDetailOut, PublicStatsOut, PublicPickOut)

# Showcase spec, "Spec changes" 3: a public pick carries its reasons, built
# from public rows in the first person. That one field name is allowed; no
# other recommendation name is.
ALLOWED_RECOMMENDATION_NAMES = {"reasons"}
```

`test_no_public_model_names_a_catalogue_field` iterates `PUBLIC_MODELS`. `test_no_public_model_names_a_recommendation_field` becomes:

```python
async def test_no_public_model_names_a_recommendation_field():
    names = set()
    for model in PUBLIC_MODELS:
        names |= _field_names(model)
    leaked = sorted(
        n
        for n in names - ALLOWED_RECOMMENDATION_NAMES
        for bad in RECOMMENDATION_NAMES
        if bad in n
    )
    assert leaked == []
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd backend && ./.venv/bin/pytest tests/test_public_outputs.py tests/test_public.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'public_outputs'`.

- [ ] **Step 3: Implement** — `backend/public_outputs.py`:

```python
"""Public, read-only outputs of Play Next and Radar (showcase spec, D).

Outputs, never inputs or state: which public games were picked recently and
why, and which cartridges are coming. Nothing here writes, generates or spends
quota; both read what the admin tools already stored. The models are
allowlists, as in public.py, and tests/test_public_outputs.py pins them.

Registered on the public router (public.py) rather than a router of its own,
so "the one unauthenticated router" stays one.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, time, timedelta

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Item, ItemStatus, ItemType, OwnedFormat, PickAction, PickEvent
from picker import public_reasons
from picker_routes import to_picker_item

# Picks from the most recent UTC day Play Next showed anything, if that day is
# within this window; older picks are not "recent" and the section hides.
PICKS_WINDOW = timedelta(days=7)
PICKS_LIMIT = 3
PICKABLE = (ItemStatus.BACKLOG, ItemStatus.ACTIVE)


class PublicPickOut(BaseModel):
    """A recent Play Next pick as the public sees it: the game, and why.

    No slot, score, date or event: those describe the owner's use of the
    tool, not the game.
    """

    id: uuid.UUID
    type: ItemType
    title: str
    cover_url: str | None
    platform: str | None
    reasons: list[str]


async def load_public_picks(
    session: AsyncSession, now: datetime
) -> list[PublicPickOut]:
    """Up to three public, owned, unpinned backlog or active games shown on
    the most recent pick day, latest first, with reasons from public rows.

    A game the owner said "never" to, or skipped after it was shown, is not
    a suggestion any more and is left out.
    """
    latest = await session.scalar(
        select(func.max(PickEvent.created_at)).where(
            PickEvent.action == PickAction.SHOWN
        )
    )
    if latest is None:
        return []
    day = latest.astimezone(UTC).date()
    if now.astimezone(UTC).date() - day >= PICKS_WINDOW:
        return []
    start = datetime.combine(day, time.min, tzinfo=UTC)
    shown = dict(
        (
            await session.execute(
                select(PickEvent.item_id, func.max(PickEvent.created_at))
                .where(
                    PickEvent.action == PickAction.SHOWN,
                    PickEvent.created_at >= start,
                    PickEvent.created_at < start + timedelta(days=1),
                )
                .group_by(PickEvent.item_id)
            )
        ).all()
    )
    answers = (
        await session.execute(
            select(PickEvent.item_id, PickEvent.action, PickEvent.created_at).where(
                PickEvent.item_id.in_(list(shown)),
                PickEvent.action.in_((PickAction.NEVER, PickAction.SKIPPED)),
            )
        )
    ).all()
    refused = {
        item_id
        for item_id, action, at in answers
        if action == PickAction.NEVER or at >= shown[item_id]
    }
    public_rows = list(
        (await session.execute(select(Item).where(Item.is_public.is_(True)))).scalars()
    )
    picks = sorted(
        (
            row
            for row in public_rows
            if row.id in shown
            and row.id not in refused
            and row.owned_format != OwnedFormat.NONE
            and row.status in PICKABLE
            and row.pinned_at is None
        ),
        key=lambda row: (-shown[row.id].timestamp(), row.title),
    )[:PICKS_LIMIT]
    profile = [to_picker_item(row) for row in public_rows]
    return [
        PublicPickOut(
            id=row.id,
            type=row.type,
            title=row.title,
            cover_url=row.cover_url,
            platform=row.platform,
            reasons=list(public_reasons(to_picker_item(row), profile)),
        )
        for row in picks
    ]
```

In `backend/public.py`:
- Add `from public_outputs import PublicPickOut, load_public_picks`.
- Change the module docstring's first paragraph to: "The only unauthenticated data router. /collection and /collection/:id are the only pages that call it; Home and Projects read a build-time snapshot of it instead (frontend/scripts/fetch-snapshot.mjs), so every other public page renders while the free-tier backend is asleep."
- Inside `create_public_router`, after `/stats` and before `/items/{item_id}`, add:

```python
    @router.get("/picks", response_model=list[PublicPickOut])
    async def public_picks(
        session: AsyncSession = Depends(get_session),
    ) -> list[PublicPickOut]:
        """Play Next's most recent picks among public games. Read-only: the
        picks were shown to the owner; nothing is generated here."""
        return await load_public_picks(session, datetime.now(UTC))
```

- [ ] **Step 4: Run them and watch them pass**

Run: `cd backend && ./.venv/bin/pytest tests/test_public_outputs.py tests/test_public.py -q`
Expected: all pass. If `Item(...)` rejects any field the helper passes, check `models.Item` and fix the helper, not the model.

- [ ] **Step 5: Format, lint, full suite, then commit**

Run: `cd backend && ./.venv/bin/ruff format . && ./.venv/bin/ruff check . && ./.venv/bin/pytest -q`

```bash
git add backend/public_outputs.py backend/public.py backend/tests/test_public_outputs.py backend/tests/test_public.py
git commit -m "feat(public): publish recent Play Next picks, read-only and first person"
```

---

### Task 15: `GET /api/public/radar`

**Files:**
- Modify: `backend/public_outputs.py`
- Modify: `backend/public.py`
- Modify: `backend/tests/test_public_outputs.py`
- Modify: `backend/tests/test_public.py` (`PUBLIC_MODELS` gains `PublicRadarOut`)

**Interfaces:**
- Produces:
  - `PublicRadarOut` with fields `{title, platform, physical_format, release_date, release_precision, igdb_url, cover_url}`.
  - `load_public_radar(session, today: date) -> list[PublicRadarOut]`.
  - `RADAR_LIMIT = 6` and `IGDB_URL_PREFIX = "https://www.igdb.com/"`.

- [ ] **Step 1: Write the failing tests.** Append to `backend/tests/test_public_outputs.py`. Add `PhysicalFormat, ReasonSource, Recommendation, RecommendationKind, RecommendationStatus` to the models import, and `PublicRadarOut` to the `public_outputs` import.

```python
RADAR_FIELDS = {
    "title",
    "platform",
    "physical_format",
    "release_date",
    "release_precision",
    "igdb_url",
    "cover_url",
}
TODAY = NOW.date()


def _radar(title: str, **fields) -> Recommendation:
    metadata = {
        "lane": "preorder",
        "section": "suggested",
        "release_precision": "day",
        "hypes": 40,
        "store_lines": [
            {
                "store": "Limited Run Games",
                "price": "59.99",
                "currency": "USD",
                "availability": "preorder",
                "preorder_closes_at": "2026-11-08T00:00:00+00:00",
                "url": "https://limitedrungames.com/products/x",
            }
        ],
        "snapshot": {"url": f"https://www.igdb.com/games/{title.lower()}"},
    }
    base = dict(
        kind=RecommendationKind.RADAR,
        type=ItemType.GAME,
        title=title,
        external_source="igdb",
        external_id=title.lower().replace(" ", "-"),
        release_date=TODAY + timedelta(days=60),
        cover_url=f"https://images.igdb.com/{title}.jpg",
        reason="Pre-orders close Nov 8 at Limited Run Games · $59.99",
        reason_source=ReasonSource.TEMPLATE,
        based_on=["x"],
        score=50,
        batch_id=uuid.uuid4(),
        status=RecommendationStatus.PENDING,
        platform_id=508,
        platform="Nintendo Switch 2",
        physical_format=PhysicalFormat.GAME_CARD,
        source_metadata=metadata,
    )
    overrides = fields.pop("source_metadata", None)
    row = Recommendation(**{**base, **fields})
    if overrides is not None:
        row.source_metadata = {**metadata, **overrides}
    return row


async def test_the_radar_model_publishes_exactly_these_fields():
    assert set(PublicRadarOut.model_fields) == RADAR_FIELDS


async def test_radar_lists_the_top_upcoming_cartridges_soonest_first(
    sessionmaker_for_test,
):
    rows = [
        _radar(f"Game {n}", score=n * 10, release_date=TODAY + timedelta(days=100 - n))
        for n in range(1, 9)
    ]
    await _add(sessionmaker_for_test, *rows)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/radar")

    assert response.status_code == 200
    body = response.json()
    # Top six by score (Game 8 .. Game 3), shown soonest first.
    assert [row["title"] for row in body] == [
        "Game 8",
        "Game 7",
        "Game 6",
        "Game 5",
        "Game 4",
        "Game 3",
    ]
    for row in body:
        assert set(row) == RADAR_FIELDS
        assert row["physical_format"] == "game_card"
        assert row["igdb_url"].startswith("https://www.igdb.com/games/")


async def test_radar_leaves_out_what_is_not_a_public_upcoming_cartridge(
    sessionmaker_for_test,
):
    await _add(
        sessionmaker_for_test,
        _radar("Keep"),
        _radar("Discover", kind=RecommendationKind.DISCOVER),
        _radar("Wanted", status=RecommendationStatus.WANTED),
        _radar("Dismissed", status=RecommendationStatus.DISMISSED),
        _radar("Key Card", physical_format=PhysicalFormat.GAME_KEY_CARD),
        _radar("Digital", physical_format=None),
        _radar("Released", release_date=TODAY),
        _radar("Undated", release_date=None),
        _radar("Some Year", source_metadata={"release_precision": "year"}),
    )
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/radar")).json()
    assert [row["title"] for row in body] == ["Keep"]


async def test_radar_links_only_to_igdb(sessionmaker_for_test):
    await _add(
        sessionmaker_for_test,
        _radar("Linked"),
        _radar("Script", source_metadata={"snapshot": {"url": "javascript:alert(1)"}}),
        _radar("Bare", source_metadata={"snapshot": {}}),
    )
    async with client_for(sessionmaker_for_test) as client:
        body = {row["title"]: row for row in (await client.get("/api/public/radar")).json()}
    assert body["Linked"]["igdb_url"] == "https://www.igdb.com/games/linked"
    assert body["Script"]["igdb_url"] is None
    assert body["Bare"]["igdb_url"] is None


async def test_radar_publishes_no_store_price_window_or_reason(sessionmaker_for_test):
    await _add(sessionmaker_for_test, _radar("Leaky"))
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/radar")
    assert set(response.json()[0]) == RADAR_FIELDS
    for leaked in (
        "Limited Run Games",
        "59.99",
        "Pre-orders close",
        "limitedrungames.com",
        "preorder",
        "suggested",
        "score",
    ):
        assert leaked not in response.text
```

In `backend/tests/test_public.py`, add `PublicRadarOut` to the `public_outputs` import and to `PUBLIC_MODELS`.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd backend && ./.venv/bin/pytest tests/test_public_outputs.py -k radar -q`
Expected: FAIL with `ImportError: cannot import name 'PublicRadarOut'`.

- [ ] **Step 3: Implement.** In `backend/public_outputs.py`:
- Add `date` to the `datetime` import.
- Add `PhysicalFormat, Recommendation, RecommendationKind, RecommendationStatus` to the models import.
- Add `from radar import NEAR_PRECISIONS`.
- Then add the code below.

```python
RADAR_LIMIT = 6
IGDB_URL_PREFIX = "https://www.igdb.com/"


class PublicRadarOut(BaseModel):
    """An upcoming cartridge from Radar, as the public sees it.

    Deliberately not a recommendation: no store, price, currency,
    availability, store link, pre-order window, score, reason or id. Those
    are the owner's shopping, and the store data is read under robots.txt
    courtesy for private use (showcase review, Part 2).
    """

    title: str
    platform: str | None
    physical_format: PhysicalFormat
    release_date: date
    release_precision: str
    igdb_url: str | None
    cover_url: str | None


def _igdb_url(metadata: dict) -> str | None:
    """IGDB's own page URL from the snapshot, or None. Anything not on
    igdb.com is dropped rather than published as a link."""
    snapshot = metadata.get("snapshot")
    url = snapshot.get("url") if isinstance(snapshot, dict) else None
    return url if isinstance(url, str) and url.startswith(IGDB_URL_PREFIX) else None


async def load_public_radar(session: AsyncSession, today: date) -> list[PublicRadarOut]:
    """The six best-scored pending Radar suggestions that are full cartridges
    dated to a day or month after today, soonest first.

    Pending only: a wanted game is already an item and shows in "On the
    radar"; dismissed and owned ones are answered. Discover never appears.
    """
    rows = (
        await session.execute(
            select(Recommendation)
            .where(
                Recommendation.kind == RecommendationKind.RADAR,
                Recommendation.status == RecommendationStatus.PENDING,
                Recommendation.physical_format == PhysicalFormat.GAME_CARD,
                Recommendation.release_date > today,
            )
            .order_by(Recommendation.score.desc(), Recommendation.title)
        )
    ).scalars()
    near = [
        row
        for row in rows
        if (row.source_metadata or {}).get("release_precision") in NEAR_PRECISIONS
    ][:RADAR_LIMIT]
    near.sort(key=lambda row: (row.release_date, row.title))
    return [
        PublicRadarOut(
            title=row.title,
            platform=row.platform,
            physical_format=row.physical_format,
            release_date=row.release_date,
            release_precision=row.source_metadata["release_precision"],
            igdb_url=_igdb_url(row.source_metadata),
            cover_url=row.cover_url,
        )
        for row in near
    ]
```

In `backend/public.py`, extend the import to `from public_outputs import PublicPickOut, PublicRadarOut, load_public_picks, load_public_radar`, and add after `/picks`:

```python
    @router.get("/radar", response_model=list[PublicRadarOut])
    async def public_radar(
        session: AsyncSession = Depends(get_session),
    ) -> list[PublicRadarOut]:
        """Radar's next cartridges: title, platform, date and an IGDB link.
        No store, price or pre-order detail."""
        return await load_public_radar(session, datetime.now(UTC).date())
```

- [ ] **Step 4: Run it and watch it pass, then run the full suite**

Run: `cd backend && ./.venv/bin/ruff format . && ./.venv/bin/ruff check . && ./.venv/bin/pytest -q`
Expected: all pass. That includes the existing `test_no_public_response_carries_a_recommendation`, whose seeded RADAR row is `WANTED` and so is absent from `/radar` too.

- [ ] **Step 5: Commit**

```bash
git add backend/public_outputs.py backend/public.py backend/tests/test_public_outputs.py backend/tests/test_public.py
git commit -m "feat(public): publish upcoming cartridges from Radar, without store data"
```

---

### Task 16: Recent picks and Coming to cartridge on `/collection`

**Files:**
- Modify: `frontend/src/lib/snapshot.js` (`SHAPES` gains `picks` and `radar`)
- Modify: `frontend/src/lib/snapshot.test.js`
- Modify: `frontend/src/pages/Collection.jsx`
- Modify: `frontend/src/pages/Collection.test.jsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `/api/public/picks` (`PublicPickOut[]`), `/api/public/radar` (`PublicRadarOut[]`), and `readSnapshot('picks' | 'radar')`.

- [ ] **Step 1: Write the failing tests**

In `snapshot.test.js`, add:

```js
  it('reads the picks and radar snapshots as lists', async () => {
    stubFetch(async () => ({ ok: true, json: async () => [] }))
    expect(await readSnapshot('picks')).toEqual([])
    expect(await readSnapshot('radar')).toEqual([])
  })
```

In `Collection.test.jsx`, extend `stubApi` to route the two new endpoints. They default to empty, so existing tests see no new sections.

```jsx
function stubApi({
  items = ITEMS,
  stats = STATS,
  itemsOk = true,
  picks = [],
  radar = [],
} = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const path = String(url)
      if (path.includes('/api/public/items')) {
        return {
          ok: itemsOk,
          status: itemsOk ? 200 : 500,
          json: async () => items,
        }
      }
      if (path.includes('/api/public/picks')) {
        return { ok: true, status: 200, json: async () => picks }
      }
      if (path.includes('/api/public/radar')) {
        return { ok: true, status: 200, json: async () => radar }
      }
      return { ok: true, status: 200, json: async () => stats }
    }),
  )
}
```

Add:

```jsx
describe('Collection outputs', () => {
  const PICK = {
    id: '2',
    type: 'boardgame',
    title: 'Gloomhaven',
    cover_url: null,
    platform: null,
    reasons: ['Shares Fantasy with Dune, which I rated 9'],
  }
  const RELEASE = {
    title: 'Metroid Prime 4',
    platform: 'Nintendo Switch 2',
    physical_format: 'game_card',
    release_date: '2027-03-12',
    release_precision: 'month',
    igdb_url: 'https://www.igdb.com/games/metroid-prime-4',
    cover_url: null,
  }

  it('lists recent picks with their reasons and no buttons', async () => {
    stubApi({ picks: [PICK] })
    await renderReady()

    const section = await screen.findByRole('region', { name: 'Recent picks' })
    expect(
      within(section).getByRole('link', { name: /Gloomhaven/ }),
    ).toHaveAttribute('href', '/collection/2')
    expect(
      within(section).getByText('Shares Fantasy with Dune, which I rated 9'),
    ).toBeInTheDocument()
    expect(within(section).queryByRole('button')).toBeNull()
  })

  it('lists coming cartridges with a month and an IGDB link', async () => {
    stubApi({ radar: [RELEASE, { ...RELEASE, title: 'Unlinked', igdb_url: null }] })
    await renderReady()

    const section = await screen.findByRole('region', {
      name: 'Coming to cartridge',
    })
    expect(
      within(section).getByRole('link', { name: /Metroid Prime 4/ }),
    ).toHaveAttribute('href', 'https://www.igdb.com/games/metroid-prime-4')
    expect(
      within(section).getAllByText('Nintendo Switch 2 · Mar 2027'),
    ).toHaveLength(2)
    expect(
      within(section).queryByRole('link', { name: /Unlinked/ }),
    ).toBeNull()
  })

  it('paints both from the snapshot while the server wakes', async () => {
    vi.mocked(readSnapshot).mockImplementation(async (name) =>
      ({ items: ITEMS, stats: STATS, picks: [PICK], radar: [RELEASE] })[name],
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    await renderReady()

    expect(
      await screen.findByRole('region', { name: 'Recent picks' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Coming to cartridge' }),
    ).toBeInTheDocument()
  })

  it('shows neither section when both are empty', async () => {
    stubApi()
    await renderReady()
    expect(screen.queryByRole('region', { name: 'Recent picks' })).toBeNull()
    expect(
      screen.queryByRole('region', { name: 'Coming to cartridge' }),
    ).toBeNull()
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npx vitest run src/lib/snapshot.test.js src/pages/Collection.test.jsx`
Expected: FAIL. `readSnapshot('picks')` returns null, and neither region exists.

- [ ] **Step 3: Implement**

In `snapshot.js`, `SHAPES` becomes `{ items: Array.isArray, stats: isObject, picks: Array.isArray, radar: Array.isArray }`.

In `Collection.jsx`, add after `OnTheRadar`:

```jsx
const RELEASE_DAY = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

/** "Mar 2027" for a month-precise release, "Mar 12, 2027" for a dated one. */
function releaseText(release) {
  const [year, month, day] = release.release_date.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    release.release_precision === 'day' ? RELEASE_DAY : MONTH_LABEL
  ).format(date)
}

/**
 * Play Next's most recent picks among public games, with the reasons it
 * gave, in the first person. Read-only: no buttons, nothing generated here
 * (showcase spec, D). Nothing when there are none.
 */
function RecentPicks({ picks }) {
  if (picks.length === 0) return null
  return (
    <section className="recent-picks" aria-label="Recent picks">
      <h2>Recent picks</h2>
      <ul className="recent-picks-list">
        {picks.map((pick) => (
          <li key={pick.id} className="recent-pick">
            <Link to={`/collection/${pick.id}`} className="recent-pick-link">
              <span className="recent-pick-cover">
                <CoverImage src={pick.cover_url} type={pick.type} alt="" />
              </span>
              <span className="recent-pick-title">{pick.title}</span>
            </Link>
            {pick.reasons.length > 0 && (
              <ul className="recent-pick-reasons">
                {pick.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Radar's next full-cartridge releases: title, platform and date, linked to
 * IGDB when a link is known. Never a store, a price or a pre-order window.
 */
function ComingToCartridge({ releases }) {
  if (releases.length === 0) return null
  return (
    <section className="coming-to-cartridge" aria-label="Coming to cartridge">
      <h2>Coming to cartridge</h2>
      <ul className="coming-list">
        {releases.map((release) => {
          const body = (
            <>
              <span className="coming-cover">
                <CoverImage src={release.cover_url} type="game" alt="" />
              </span>
              <span className="coming-title">{release.title}</span>
              <span className="coming-meta muted">
                {[release.platform, releaseText(release)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </>
          )
          return (
            <li key={`${release.title}-${release.platform}`}>
              {release.igdb_url ? (
                <a
                  href={release.igdb_url}
                  className="coming-link"
                  rel="noreferrer noopener"
                >
                  {body}
                </a>
              ) : (
                <span className="coming-link">{body}</span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

In `Collection`, add state and a second effect after the first:

```jsx
  const [picks, setPicks] = useState([])
  const [releases, setReleases] = useState([])
```

```jsx
  // The two read-only outputs. Extras, not the shelf: each paints from its
  // snapshot, is replaced by live data, and fails silently.
  useEffect(() => {
    let cancelled = false
    for (const [name, apply] of [
      ['picks', setPicks],
      ['radar', setReleases],
    ]) {
      let live = false
      readSnapshot(name).then((rows) => {
        if (!cancelled && !live && rows) apply(rows)
      })
      apiFetch(`/api/public/${name}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((rows) => {
          if (!cancelled && Array.isArray(rows)) {
            live = true
            apply(rows)
          }
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [])
```

In the ready body, replace:

```jsx
          <UpNext items={items} />
          <OnTheRadar items={items} />
```

with:

```jsx
          <UpNext items={items} />
          <RecentPicks picks={picks} />
          <div className="radar-row">
            <OnTheRadar items={items} />
            <ComingToCartridge releases={releases} />
          </div>
```

Append to `index.css` after the `.on-the-radar h2` rule:

```css
/* /collection: the read-only outputs of Play Next and Radar. */
.recent-picks,
.coming-to-cartridge {
  margin: 1.5rem 0;
}

.recent-picks h2,
.coming-to-cartridge h2 {
  font-size: 1.1rem;
  margin: 0 0 0.75rem;
}

.recent-picks-list,
.coming-list {
  display: grid;
  gap: var(--grid-gap);
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  list-style: none;
  margin: 0;
  padding: 0;
}

.recent-pick-link,
.coming-link {
  align-items: center;
  color: var(--text);
  display: grid;
  gap: 0 0.75rem;
  grid-template-columns: 3rem 1fr;
}

.recent-pick-link:focus-visible,
.coming-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.recent-pick-cover,
.coming-cover {
  grid-row: span 2;
}

.recent-pick-title,
.coming-title {
  font-weight: 600;
}

.coming-meta {
  font-size: 0.8125rem;
}

.recent-pick-reasons {
  color: var(--text-muted);
  font-size: 0.8125rem;
  margin: 0.375rem 0 0 3.75rem;
  padding: 0;
}

.radar-row {
  display: grid;
  gap: 0 2rem;
}

@media (min-width: 40rem) {
  .radar-row:has(> :nth-child(2)) {
    grid-template-columns: 1fr 1fr;
  }
}
```

(The CSS media query is layout only; nothing reads it in JS, so `useMediaQuery` does not apply. The `:has()` rule keeps a single section full width.)

- [ ] **Step 4: Run them and watch them pass, then check visually**

Run: `cd frontend && npx vitest run src/lib/snapshot.test.js src/pages/Collection.test.jsx`
Expected: all pass.

For the visual check, run the backend locally with seeded picks and radar, or use a snapshot. Look at `/collection` at 375px and at desktop width, in both themes:
- The two strips sit side by side on desktop and stack on a phone.
- The reasons use muted text.

- [ ] **Step 5: Format, lint, full suite, then commit**

Run: `cd frontend && npx prettier --write src/lib/snapshot.js src/lib/snapshot.test.js src/pages/Collection.jsx src/pages/Collection.test.jsx src/index.css && npx eslint src && npm test`

```bash
git add frontend/src/lib/snapshot.js frontend/src/lib/snapshot.test.js frontend/src/pages/Collection.jsx frontend/src/pages/Collection.test.jsx frontend/src/index.css
git commit -m "feat(collection): show recent picks and upcoming cartridges"
```

**Zone 3 exit:**
- Run the self code review (✅/❌) and fix every ❌.
- Present the batch review and write the notifier file.
- **STOP.**

---

## Zone 4 — IGDB `url` (the owner records fixtures)

Zone-start SHA: record it before Task 17.

### Task 17: Request and store IGDB's page URL

**Files:**
- Modify: `backend/sources/igdb.py` (`FIELDS`, and the snapshot dict at ~line 425)
- Modify: `backend/scripts/record_igdb_fixtures.py` (`GAME_FIELDS`)
- Modify: `backend/tests/fixtures/igdb_game.json` and `igdb_games_e7b.json`. The recorder re-records these; they are never edited by hand.
- Test: `backend/tests/test_sources_igdb.py`

- [ ] **Step 1: Change both field lists.** In `FIELDS` (`sources/igdb.py`) and in `GAME_FIELDS` (`scripts/record_igdb_fixtures.py`), change `"game_status.status;"` to `"game_status.status,url;"`.

- [ ] **Step 2: OWNER STOP — record the fixtures.** Report the command below and wait. The recorder is run by the owner, because it reads credentials from `backend/.env`.

```bash
cd backend && ./.venv/bin/python scripts/record_igdb_fixtures.py
```

After it runs, check that the fixtures changed: `git diff --stat backend/tests/fixtures` should list `igdb_game.json` and `igdb_games_e7b.json` (plus any other file the default run writes). Also confirm every game row has a `url`: `python3 -c "import json; print(all('url' in r for r in json.load(open('backend/tests/fixtures/igdb_game.json'))))"`, which should print `True`.

- [ ] **Step 3: Write the failing test.** Append to `backend/tests/test_sources_igdb.py`, next to `test_the_snapshot_carries_the_e7b_keys`. It uses that file's existing `_parse` helper, `_detail_payload` and `MARIO_KART_WORLD` constant.

```python
def test_the_snapshot_keeps_igdbs_page_url():
    snapshot = _parse(MARIO_KART_WORLD).source_metadata
    assert snapshot["url"].startswith("https://www.igdb.com/games/")

    detail = IgdbSource(_config())._parse_detail(_detail_payload())
    assert detail.source_metadata["url"].startswith("https://www.igdb.com/games/")
```

- [ ] **Step 4: Run it and watch it fail**

Run: `cd backend && ./.venv/bin/pytest tests/test_sources_igdb.py -k page_url -q`
Expected: FAIL with `KeyError: 'url'`, because the snapshot builder drops the field.

- [ ] **Step 5: Implement.** In the snapshot dict in `sources/igdb.py`, after `"genres": …`, add:

```python
            # IGDB's own page, for the public radar's link (showcase spec,
            # K7). Kept only when it is on igdb.com.
            "url": row.get("url")
            if str(row.get("url") or "").startswith("https://www.igdb.com/")
            else None,
```

- [ ] **Step 6: Run it and watch it pass, then run the full suite.** Tests that pin the snapshot's exact keys will fail first. Add `"url"` to each of those key sets, and list them in the zone report.

Run: `cd backend && ./.venv/bin/ruff format . && ./.venv/bin/ruff check . && ./.venv/bin/pytest -q`
Expected: all pass. If more than two test files need key-set updates, stop and report, because this task would exceed five files.

- [ ] **Step 7: Commit**

```bash
git add backend/sources/igdb.py backend/scripts/record_igdb_fixtures.py backend/tests/fixtures/igdb_game.json backend/tests/fixtures/igdb_games_e7b.json backend/tests/test_sources_igdb.py
git commit -m "feat(igdb): keep IGDB's page URL in the snapshot"
```

If the recorder also rewrote other fixture files, or a key-set test file changed, commit those in a second boundary commit: `test(igdb): re-record fixtures with the url field`.

**Zone 4 exit:**
- Run the self code review and present the batch review.
- Include the backfill note: existing catalogue rows gain `url` as their snapshots age past 30 days, at up to 2 × BATCH per Resolve. Until then they render without a link.
- **STOP.**

---

## Zone 5 — snapshot, smoke, docs (deploy path)

Zone-start SHA: record it before Task 18.

### Task 18: Snapshot the outputs too

**Files:**
- Modify: `frontend/scripts/fetch-snapshot.mjs` (`SNAPSHOTS`)
- Modify: `frontend/scripts/fetch-snapshot.test.mjs`
- Modify: `.github/workflows/snapshot.yml` (the loop)
- Modify: `frontend/scripts/README.md`

- [ ] **Step 1: Write the failing test.** Append to `fetch-snapshot.test.mjs`:

```js
  it('writes the outputs too, and builds without one that fails', async () => {
    const fetchImpl = api({
      '/api/health': ok({ status: 'ok' }),
      '/api/public/items': ok(ITEMS),
      '/api/public/stats': ok(STATS),
      '/api/public/picks': ok([]),
    })
    expect(await run(fetchImpl)).toBe('written')
    expect(await written()).toEqual(['items.json', 'picks.json', 'stats.json'])
  })
```

Here radar answers 404, as it would before the API has deployed: the snapshot is optional, so it is left out.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run scripts/fetch-snapshot.test.mjs`
Expected: FAIL, because `picks.json` is not written.

- [ ] **Step 3: Implement.** Add to `SNAPSHOTS`:

```js
  // Optional: on a deploy that ships these endpoints, the static build can
  // run before the API has finished deploying.
  picks: { path: '/api/public/picks', valid: Array.isArray, required: false },
  radar: { path: '/api/public/radar', valid: Array.isArray, required: false },
```

In `snapshot.yml`, change `for name in items stats; do` to `for name in items stats picks radar; do`.

In `scripts/README.md`, change the "What and why" file list to `items.json`, `stats.json`, `picks.json` and `radar.json`, and add this bullet under "When it runs": "`picks` and `radar` are optional; if either fails, the build leaves that file out."

- [ ] **Step 4: Run it and watch it pass, then validate**

Run: `cd frontend && npx vitest run scripts/fetch-snapshot.test.mjs && node -e "require('js-yaml').load(require('fs').readFileSync('../.github/workflows/snapshot.yml','utf8')); console.log('ok')" && npx prettier --write scripts && npx eslint scripts && npm test`

- [ ] **Step 5: Commit**

```bash
git add frontend/scripts/fetch-snapshot.mjs frontend/scripts/fetch-snapshot.test.mjs frontend/scripts/README.md .github/workflows/snapshot.yml
git commit -m "build(frontend): snapshot recent picks and upcoming cartridges"
```

---

### Task 19: Smoke checks and the recorded rule change

**Files:**
- Modify: `scripts/smoke.sh`
- Modify: `CLAUDE.md`
- Modify: `README.md` (public API section)

- [ ] **Step 1: smoke.sh.** After the snapshot loop, add the block below. Then change the snapshot loop to `for name in items stats picks radar; do`.

```bash
# Showcase PR2: the read-only outputs. Each must be a list and must carry
# none of the fields that describe the owner's shopping or use of the tool.
OUTPUT_FORBIDDEN='"(score|slot|slot_label|store|price|currency|availability|preorder_closes_at|url|batch_id|based_on|lane|section|hypes|listing_ids|format_source|format_note|status|acquired_at|notes|cart_id|reason|reason_source)"'
for name in picks radar; do
  check_equals "GET /api/public/$name unauthenticated" \
    "$(http_status "$API_URL/api/public/$name")" "200"
  body="$(curl -s -m 90 "$API_URL/api/public/$name")"
  if [ "${body:0:1}" != "[" ]; then
    report_fail "public $name is a list" "got '${body:0:80}'"
  elif printf '%s' "$body" | grep -qE "$OUTPUT_FORBIDDEN"; then
    report_fail "public $name exposes no private fields" "found a forbidden key"
  else
    report_pass "public $name exposes no private fields" "list, allowlisted keys only"
  fi
done
```

(`"url"` matches only an exact key named `url`, so `igdb_url` and `cover_url` pass. `"reason"` does not match `"reasons"`, the picks' allowed field.)

- [ ] **Step 2: Syntax check.** Run `bash -n scripts/smoke.sh`. The full run against production happens after deploy, in the environment tests.

- [ ] **Step 3: CLAUDE.md.** In the Radar paragraph, replace `**Nothing from `recommendations` is public**:` and the sentence it begins with:

```
**Only seven fields of pending Radar rows are public**
  (`/api/public/radar`, showcase spec, "Spec changes"): title, platform,
  format, release date and precision, IGDB link and cover -- for full
  cartridges dated to a day or month after today, the top six by score.
  Never a store, price, pre-order window, reason, score or id, and nothing
  from Discover. `tests/test_public_outputs.py` pins the fields. Otherwise,
```

Keep the rest of the sentence ("Want creates an ordinary item …") as it is.

In the Play Next bullet, append:

```
  `/api/public/picks` publishes the most recent shown day's picks (within 7
  days) among public, owned, unpinned games, with `picker.public_reasons`:
  reasons rebuilt from public rows only, without the slot reasons, since
  "On the shelf since" is read from the private `acquired_at`. Reasons are
  first person everywhere ("which I rated 9").
```

- [ ] **Step 4: README.md.** In the section that documents the public API, or next to Collection snapshot if there is none, add:

```markdown
### Public API

All read-only, unauthenticated, and allowlisted by hand in `backend/public.py`
and `backend/public_outputs.py`; `backend/tests/test_public*.py` pin every
field.

| Route | What |
|---|---|
| `GET /api/public/items` | Every public item, most recently finished first |
| `GET /api/public/items/{id}` | One public item with description and similar games; 404 for unknown and private alike |
| `GET /api/public/stats` | Counts over public rows |
| `GET /api/public/picks` | Play Next's most recent picks among public games, with first-person reasons |
| `GET /api/public/radar` | Up to six upcoming full-cartridge releases: title, platform, date, IGDB link, cover |
```

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke.sh CLAUDE.md README.md
git commit -m "docs: record the public picks and radar rule and smoke-check both"
```

**Zone 5 exit, which is also the PR2 finish gate:**
- Run the same preflight as PR1, then an ultra review. PR2 touches 4+ files and has CI surface.
- Draft the PR description, which must list Spec changes 1–3 and 5.
- Write the notifier file and **STOP**.

**Owner:**
- Push `tracker-showcase-public`, open PR2 and merge it. PR2 has no migration.
- Run `snapshot.yml`, then give me the go for PR2's environment tests.

---

## Execution zones

```
Zone 1 (auto): tasks 1–8        — PR1 frontend
CHECKPOINT — batch review
Zone 2 (auto): tasks 9–11       — build step, CI workflow, smoke (deploy path)
CHECKPOINT — batch review + PR1 finish gate
  (owner: deploy hook, secret, push, merge, run snapshot.yml)
Zone 3 (auto): tasks 12–16      — PR2 backend + frontend
CHECKPOINT — batch review
Zone 4 (stops once): task 17    — IGDB url; owner records fixtures mid-task
CHECKPOINT — batch review
Zone 5 (auto): tasks 18–19      — snapshot outputs, smoke, docs (deploy path)
CHECKPOINT — batch review + PR2 finish gate
```

**Parallel-safe:** none. All the PR1 frontend tasks share `Collection.jsx`, `index.css` or test files. PR2 depends on PR1. Sequential throughout.

**Commit boundaries:** one commit per task, as marked, each ≤5 files. The two exceptions are called out in place: Task 2 holds `index.css` back for Task 3, and Task 17 may take a second commit for re-recorded fixtures.

## Automated environment tests

**Smoke util:** `scripts/smoke.sh` exists and is extended by Tasks 11 and 19. Run it as `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`.

**PR1, after the owner merges and runs `snapshot.yml`:**
1. `snapshot.yml` run summary: "Deploy triggered; changed: items stats" on the first run. A second dispatch after that deploy should say "Snapshot unchanged; no deploy".
2. The Render static-site deploy log contains `snapshot: wrote items, stats (N items)`.
3. The smoke run passes every check, with `PASS snapshot items.json` and `PASS snapshot stats.json`, 0 failed and 0 warned.
4. Headless browser check (the in-app browser):
   - `/collection` with the API asleep, meaning at least 15 minutes idle: the grid paints without "Waking the server", and live data replaces it.
   - `/`: the nav reads Home · About · Projects · Collection with no Blog, and the Collection card shows covers.
   - `/projects`: the strip is on the tracker card.
   - An item page reads "My rating" and has the "My copy" line.
5. Render API logs show no new errors. The static-site build shows no errors apart from the expected snapshot line.

**PR2, after merge:**
1. The smoke run is green. It adds `GET /api/public/picks|radar` at 200 and the checks on their fields, and `PASS snapshot picks.json|radar.json`, or WARN until the next `snapshot.yml` run.
2. `curl -s https://api.joey-haas.dev/api/public/radar | jq '.[0] | keys'` equals the seven `RADAR_FIELDS`. `…/picks | jq '.[0] | keys'` equals the six `PICK_FIELDS`, or returns `[]` until Play Next is run.
3. Browser check: `/collection` shows Recent picks after the owner runs Play Next once, and Coming to cartridge after a Radar Generate.
4. The Render API logs are clean.

**Passing** means the smoke run is green, the browser checks hold, and there are no new errors in either service's logs. Anything red goes to structured debugging.

## Part E (after the code lands)

This part isn't planned yet: the owner writes the content with me.
- `frontend/posts/how-the-tracker-works.md`, the first published post. Publishing it turns the Blog nav on.
- The Projects card's `more: { to: '/blog/how-the-tracker-works', label: 'How it works' }`.
- It gets its own short plan when it starts.
