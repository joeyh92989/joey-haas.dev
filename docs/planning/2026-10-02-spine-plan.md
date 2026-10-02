# Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Name the tracker Spine everywhere it is public, move it to `/spine`
with redirects, give the Projects card real detail, publish the how-it-works
post, and add per-page titles, link-preview meta and a footer credit.

**Architecture:** Frontend only. Copy lives in `content/` (a new `spine.js`,
plus `profile.repo`); routing changes in `App.jsx` and `RootLayout.jsx`; a
`usePageTitle` hook sets `document.title` on every page; static meta and a
generated 1200×630 card live in `index.html` and `public/`. No backend,
schema, `render.yaml` or API-path change.

**Tech Stack:** React 19.2, react-router 8.3.1 (declarative, imported from
`react-router`), Vite, Vitest 4 + Testing Library + jsdom, plain CSS with
tokens in `src/index.css`.

**Spec:** `docs/planning/2026-10-02-spine-design.md` · **Brief:**
`docs/planning/2026-10-02-spine-brief.md`

## Global Constraints

- Canonical tagline, verbatim, `/spine` lede only: `A tracker for my physical game collection: what I own, what I’ve finished, and what to play next.`
- Projects tagline variant: `A tracker for a physical game collection` · Home card sub-line: `The game tracker I built: what I own, what I’ve finished, what’s next.`
- Bare name "Spine" only in: nav label, `/spine` `h1`, Home card title, Projects `h2`, "Open Spine →", page titles.
- Apostrophes in copy are typographic (`’`), matching existing content.
- Never "the Spine", never "Spine tracker" in UI copy.
- File and module names do not change; a one-line comment where a name no longer matches what it renders.
- API paths (`/api/public/*`) and `/admin/*` routes do not move; admin labels unchanged.
- Public pages other than `/spine*` make no API calls (RootLayout's `/api/auth/me` excepted).
- Style with tokens only, never raw hex; nothing hover-only; `useMediaQuery`, never `matchMedia`.
- New copy goes in `content/`; Home's existing link-card copy stays inline.
- Commits: conventional, ≤5 files, each independently green, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, merge or rebase.
- After every file change: `cd frontend && npx prettier --write <files> && npx eslint <files>`; zero errors, warnings flagged.
- Test command: `cd frontend && npm test` (whole suite) or `npm test -- <path>` (one file). Backend suite untouched: `cd backend && ./.venv/bin/pytest` stays green with no edits.
- Repo URL: `https://github.com/joeyh92989/joey-haas.dev`.

## File map

| File | Responsibility | Tasks |
|---|---|---|
| `frontend/src/lib/usePageTitle.js` (new) | Set `document.title` | 1 |
| `frontend/src/lib/usePageTitle.test.jsx` (new) | Hook test | 1 |
| `frontend/src/App.jsx` | Route table, redirects | 2 |
| `frontend/src/App.test.jsx` (new) | Redirects, route-table titles | 2, 9, 10, 12, 13 |
| `frontend/src/layouts/RootLayout.jsx` | Nav, `WIDE_ROUTES`, footer | 2, 7 |
| `frontend/src/content/profile.js` | `repo` | 4 |
| `frontend/src/content/spine.js` (new) | Spine copy | 4 |
| `frontend/src/pages/Collection.jsx` | `/spine` shelf, header block | 3, 4, 10 |
| `frontend/src/pages/Item.jsx` | `/spine/:id` | 3, 11 |
| `frontend/src/pages/Home.jsx` · `Projects.jsx` | Copy, cards | 5, 6, 9 |
| `frontend/src/content/projects.js` | Project entries | 6 |
| `frontend/src/index.css` | Header, card, footer styles; comments | 3, 4, 6, 7 |
| `frontend/index.html` · `frontend/public/og-card.png` (new) · `frontend/src/meta.test.js` (new) | Meta, card | 8 |
| Other pages (`About`, `Blog`, `BlogPost`, `NotFound`, admin) | Titles | 9–13 |
| `frontend/posts/how-spine-works.md` | Publish | 16 |
| `CLAUDE.md` · `README.md` | Docs | 17 |

---

## Zone 1

### Task 1: `usePageTitle` hook

**Files:**
- Create: `frontend/src/lib/usePageTitle.js`
- Test: `frontend/src/lib/usePageTitle.test.jsx`

**Interfaces:**
- Produces: `usePageTitle(title: string | null): void` — named export. A
  `null` title leaves `document.title` untouched (for a page that hands
  rendering to `NotFound`: React runs a child's effects before its parent's,
  so a parent that also set a title would overwrite the child's).

- [ ] **Step 1: Write the failing test**

```jsx
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { usePageTitle } from './usePageTitle.js'

function Page({ title }) {
  usePageTitle(title)
  return null
}

afterEach(() => {
  document.title = ''
})

describe('usePageTitle', () => {
  it('sets the title', () => {
    render(<Page title="About · Joey Haas" />)
    expect(document.title).toBe('About · Joey Haas')
  })

  it('follows a changed title', () => {
    const { rerender } = render(<Page title="Spine · Joey Haas" />)
    rerender(<Page title="Hades · Spine" />)
    expect(document.title).toBe('Hades · Spine')
  })

  // A page that renders NotFound passes null, so NotFound's own title stands.
  it('leaves the title alone when given null', () => {
    document.title = 'Not found · Joey Haas'
    render(<Page title={null} />)
    expect(document.title).toBe('Not found · Joey Haas')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npm test -- src/lib/usePageTitle.test.jsx`
Expected: FAIL, cannot resolve `./usePageTitle.js`.

- [ ] **Step 3: Implement**

```js
import { useEffect } from 'react'

/**
 * Sets the document title while the calling page is mounted.
 *
 * There is no cleanup: every routed page sets its own title, so restoring
 * the previous one on unmount would only flash it. A null title leaves the
 * current one alone. That is for a page that hands rendering to a child that
 * sets its own (NotFound): React runs a child's effects before its parent's,
 * so a parent that set a title too would overwrite the child's.
 *
 * The title must already be one string: callers build it with a template
 * literal, never as JSX children.
 *
 * @param {string | null} title The full title, or null to leave it alone.
 */
export function usePageTitle(title) {
  useEffect(() => {
    if (title) document.title = title
  }, [title])
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd frontend && npm test -- src/lib/usePageTitle.test.jsx` → 3 passed.
Then `npx prettier --write src/lib/usePageTitle.js src/lib/usePageTitle.test.jsx && npx eslint src/lib/usePageTitle.js src/lib/usePageTitle.test.jsx`.

- [ ] **Step 5: Commit** — boundary 1 (2 files)

```bash
git add frontend/src/lib/usePageTitle.js frontend/src/lib/usePageTitle.test.jsx
git commit -m "feat: add usePageTitle hook"
```

### Task 2: `/spine` routes, redirects, nav

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/layouts/RootLayout.jsx:15-22` (`WIDE_ROUTES`), `:44-52` (`navItems`)
- Modify: `frontend/src/layouts/RootLayout.test.jsx` (wide-pages and nav blocks)
- Create: `frontend/src/App.test.jsx`

**Interfaces:**
- Produces: routes `spine` → `Collection`, `spine/:id` → `Item`; legacy
  `collection` and `collection/:id` redirect with `replace`. `App.test.jsx`
  exports nothing but establishes `renderAt(path)`, the `content.posts`
  hoisted mock and the never-answering `fetch` stub that Tasks 9–13 extend.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/App.test.jsx`:

```jsx
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'

// posts.js globs markdown the Vitest config cannot compile, so it is
// replaced. Tests push onto this array to publish a post.
const content = vi.hoisted(() => ({ posts: [] }))
vi.mock('./content/posts.js', () => ({
  posts: content.posts,
  findPost: (slug) => content.posts.find((post) => post.slug === slug),
  formatDate: (date) => date,
}))
vi.mock('./lib/snapshot.js', () => ({ readSnapshot: vi.fn(async () => null) }))
vi.mock('./lib/useMediaQuery.js', () => ({ useMediaQuery: () => false }))

/** Prints the router's current path, so a redirect can be observed. */
function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Location />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  // Never answers: every API-backed page stays in its loading state.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  content.posts.length = 0
})

describe('App redirects', () => {
  it('sends /collection to /spine', async () => {
    renderAt('/collection')
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/spine$/),
    )
  })

  it('carries the id from /collection/:id to /spine/:id', async () => {
    renderAt('/collection/42')
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        /^\/spine\/42$/,
      ),
    )
  })
})
```

In `RootLayout.test.jsx`, change the wide-pages list to
`['/spine', '/spine/abc', '/admin/collection/abc']`, and the nav block to:

```jsx
  it('lists Spine, and no Blog while nothing is published', () => {
    renderAt('/about')
    expect(navLabels()).toEqual(['Home', 'About', 'Projects', 'Spine'])
  })

  it('adds Blog last once a post is published', () => {
    content.posts.push({
      slug: 'first',
      frontmatter: { title: 'First', date: '2026-10-01' },
    })
    renderAt('/about')
    expect(navLabels()).toEqual(['Home', 'About', 'Projects', 'Spine', 'Blog'])
  })

  it('keeps Spine current on an item page', () => {
    renderAt('/spine/abc')
    expect(
      within(screen.getByRole('navigation')).getByRole('link', {
        name: 'Spine',
      }),
    ).toHaveAttribute('aria-current', 'page')
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npm test -- src/App.test.jsx src/layouts/RootLayout.test.jsx`
Expected: FAIL. The redirect tests stay at `/collection` (it currently
renders the shelf), and the nav/wide tests still see "Collection".

- [ ] **Step 3: Implement**

`App.jsx`: import `Navigate` and `useParams` alongside `Route, Routes`, add
above `App`:

```jsx
/**
 * The pre-rename item URL. `Navigate` does not interpolate route params, so
 * the id is read here and carried to /spine/:id.
 */
function CollectionItemRedirect() {
  const { id } = useParams()
  return <Navigate to={`/spine/${encodeURIComponent(id)}`} replace />
}
```

and replace the two `collection` routes with:

```jsx
        <Route path="spine" element={<Collection />} />
        <Route path="spine/:id" element={<Item />} />
        {/* Pre-rename URLs, kept so links already shared still land. */}
        <Route path="collection" element={<Navigate to="/spine" replace />} />
        <Route path="collection/:id" element={<CollectionItemRedirect />} />
```

`RootLayout.jsx`: in `WIDE_ROUTES` replace `'/collection'` with `'/spine'`;
in `navItems` replace `{ to: '/collection', label: 'Collection' }` with
`{ to: '/spine', label: 'Spine' }`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npm test -- src/App.test.jsx src/layouts/RootLayout.test.jsx` → all pass. Prettier + ESLint on the four files.

- [ ] **Step 5: Commit** — boundary 2 (4 files)

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx frontend/src/layouts/RootLayout.jsx frontend/src/layouts/RootLayout.test.jsx
git commit -m "feat: move the public shelf to /spine with redirects"
```

### Task 3: Internal links and comments follow the route

**Files:**
- Modify: `frontend/src/pages/Collection.jsx` (links at ~233, ~267, ~303, ~726, ~773; doc comment at ~495)
- Modify: `frontend/src/pages/Item.jsx` (link at ~403; doc comments at ~180, ~194)
- Modify: `frontend/src/pages/Collection.test.jsx` (hrefs at ~169, ~651, ~825)
- Modify: `frontend/src/pages/Item.test.jsx` (route paths at ~60-63 and ~273-275; href at ~207)

**Interfaces:** none new.

- [ ] **Step 1: Update the tests first**

In `Collection.test.jsx` replace the three expected hrefs `'/collection/1'`,
`'/collection/1'`, `'/collection/2'` with `'/spine/1'`, `'/spine/1'`,
`'/spine/2'`. In `Item.test.jsx` replace every `/collection/` with `/spine/`
(the two `initialEntries`, the two `path="/collection/:id"`, and the
expected `'/collection/a'` href).

- [ ] **Step 2: Run to verify the href tests fail**

Run: `cd frontend && npm test -- src/pages/Collection.test.jsx src/pages/Item.test.jsx`
Expected: the three Collection href tests and Item's "more from this shelf"
test FAIL with `'/collection/…'` received.

- [ ] **Step 3: Implement**

In `Collection.jsx` and `Item.jsx` replace each `` `/collection/${…}` ``
link target with `` `/spine/${…}` `` (the `/admin/collection/` edit link in
`Item.jsx` stays). Comments: `Item.jsx` ~180 becomes ``One public item:
`/spine/:id`.``, ~194 ``Under /spine, so it may call the API, …``. Above
`export default function Collection()` the doc comment's first line becomes:

```js
/**
 * The public shelf at /spine (Spine). The file keeps its pre-rename name.
```

Run `grep -n "'/collection\|\`/collection" frontend/src/pages/Collection.jsx frontend/src/pages/Item.jsx` → no output.

- [ ] **Step 4: Run to verify they pass**

Run the two test files → pass. Prettier + ESLint on the four files.

- [ ] **Step 5: Commit** — boundary 3 (4 files)

```bash
git add frontend/src/pages/Collection.jsx frontend/src/pages/Item.jsx frontend/src/pages/Collection.test.jsx frontend/src/pages/Item.test.jsx
git commit -m "refactor: point shelf and item links at /spine"
```

- [ ] **Step 6: Comment sweep** — boundary 4 (4 files, comments only)

- `frontend/src/lib/snapshot.js:8`: `/collection may read them` → `/spine may read them`.
- `frontend/scripts/fetch-snapshot.mjs:5`: `/collection would otherwise` → `/spine would otherwise`.
- `frontend/src/index.css:2569` and `:2579`: `/* /collection: …` → `/* /spine: …`.
- `scripts/smoke.sh`, after the `/blog` NOTE paragraph (line ~68), add:

```bash
# The same holds for /spine and the client-side /collection redirects: they
# are verified in the browser after deploy, not here.
```

Run `cd frontend && npm test` → green; `bash -n scripts/smoke.sh` → no output.

```bash
git add frontend/src/lib/snapshot.js frontend/scripts/fetch-snapshot.mjs frontend/src/index.css scripts/smoke.sh
git commit -m "docs: name /spine in comments that named /collection"
```

### Task 4: Spine copy and the `/spine` header block

**Files:**
- Create: `frontend/src/content/spine.js`
- Modify: `frontend/src/content/profile.js` (add `repo` after `github`)
- Modify: `frontend/src/pages/Collection.jsx` (three `h1`s at ~625, ~647, ~699; sub-line at ~700-703)
- Modify: `frontend/src/pages/Collection.test.jsx` (new describe block)
- Modify: `frontend/src/index.css` (after the `/* Public collection showcase. */` comment, ~1209)

**Interfaces:**
- Produces: `profile.repo: string`. `spine` named export from
  `content/spine.js`:
  `{ name: 'Spine', path: '/spine', tagline, projectsTagline, projectLine, links: { post: { to, label }, source: { href, label } } }`.
  Task 6 consumes `spine.name`, `spine.path`, `spine.projectsTagline`,
  `spine.links.post`, `spine.links.source`.

- [ ] **Step 1: Write the failing tests** (append to `Collection.test.jsx`)

```jsx
describe('Collection header', () => {
  it('names Spine, says what it is, and links the post and the source', async () => {
    stubApi()
    await renderReady()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Spine' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/^A tracker for my physical game collection:/),
    ).toBeInTheDocument()
    expect(screen.getByText(/^I built this:/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /How it works/ })).toHaveAttribute(
      'href',
      '/blog/how-spine-works',
    )
    expect(screen.getByRole('link', { name: /Source/ })).toHaveAttribute(
      'href',
      'https://github.com/joeyh92989/joey-haas.dev',
    )
  })

  // A cold start leads with the waking notice, not a project pitch.
  it('keeps the project line out of the loading state', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    renderPage()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Spine' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^I built this:/)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npm test -- src/pages/Collection.test.jsx`
Expected: the two new tests FAIL (heading is "Collection").

- [ ] **Step 3: Implement**

`profile.js`, after `github`:

```js
  /** This site's repository: the footer, Projects and /spine link to it. */
  repo: 'https://github.com/joeyh92989/joey-haas.dev',
```

`content/spine.js`:

```js
import { profile } from './profile.js'

/**
 * Spine's public copy: the tracker's name and the lines that say what it is.
 *
 * One home for the wording, so a change touches one file. `tagline` is the
 * canonical line and appears only as the /spine lede; `projectsTagline` is
 * a deliberate shorter variant for the Projects card (Spine brief, "The
 * name"). Link labels carry no arrow: pages append it.
 */
export const spine = {
  name: 'Spine',
  path: '/spine',
  tagline:
    'A tracker for my physical game collection: what I own, what I’ve finished, and what to play next.',
  projectsTagline: 'A tracker for a physical game collection',
  projectLine:
    'I built this: React and FastAPI on free tiers, Postgres on Neon, and a camera pointed at the shelf.',
  links: {
    post: { to: '/blog/how-spine-works', label: 'How it works' },
    source: { href: profile.repo, label: 'Source' },
  },
}
```

`Collection.jsx`: `import { spine } from '../content/spine.js'`. The loading
and error `h1`s become `<h1>{spine.name}</h1>`. In the loaded return,
replace the `h1` and the "What I own…" paragraph with:

```jsx
      <h1>{spine.name}</h1>
      <p className="spine-lede">{spine.tagline}</p>
      <p className="spine-project muted">
        {spine.projectLine}{' '}
        <Link to={spine.links.post.to}>{spine.links.post.label} &rarr;</Link>{' '}
        <a href={spine.links.source.href}>
          {spine.links.source.label} &rarr;
        </a>
      </p>
```

`index.css`, after `/* Public collection showcase. */`:

```css
/* /spine: the header block above the hero numbers. Capped at the prose
   width so the lede does not run the full 72rem of the wide page. */
.spine-lede {
  color: var(--text-body);
  font-size: 1.0625rem;
  margin: 0.375rem 0 0;
  max-width: 45rem;
}

.spine-project {
  font-size: 0.875rem;
  margin: 0.5rem 0 0;
  max-width: 45rem;
}

/* A link label never breaks across lines; the sentence before it may. */
.spine-project a {
  white-space: nowrap;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npm test -- src/pages/Collection.test.jsx` → pass.
Prettier + ESLint on the five files.

- [ ] **Step 5: Commit** — boundary 5 (5 files)

```bash
git add frontend/src/content/spine.js frontend/src/content/profile.js frontend/src/pages/Collection.jsx frontend/src/pages/Collection.test.jsx frontend/src/index.css
git commit -m "feat: give /spine a header that says what it is"
```

### Task 5: Home cards

**Files:**
- Modify: `frontend/src/pages/Home.jsx:35-49`
- Modify: `frontend/src/pages/Home.test.jsx:24-29`

- [ ] **Step 1: Write the failing tests** — replace "links to the collection from its own card" with:

```jsx
  it('links to Spine from its own card', () => {
    renderHome()
    const card = screen.getByRole('link', { name: /^Spine/ })
    expect(card).toHaveAttribute('href', '/spine')
    expect(card).toHaveTextContent(
      'The game tracker I built: what I own, what I’ve finished, what’s next.',
    )
  })

  it('names Spine on the work card', () => {
    renderHome()
    expect(screen.getByRole('link', { name: /See my work/ })).toHaveTextContent(
      'Spine, and this very site.',
    )
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npm test -- src/pages/Home.test.jsx` → the two FAIL.

- [ ] **Step 3: Implement** — in `Home.jsx` the second card's sub-line becomes `Spine, and this very site.`; the third card becomes:

```jsx
        <Link className="link-card" to="/spine">
          <span className="link-card-title">Spine</span>
          <span className="link-card-arrow"> &rarr;</span>
          <span className="link-card-sub">
            The game tracker I built: what I own, what I’ve finished, what’s
            next.
          </span>
          <CoverStrip />
        </Link>
```

- [ ] **Step 4: Run to verify they pass**; Prettier + ESLint on both files.

- [ ] **Step 5: Commit** — boundary 6 (2 files)

```bash
git add frontend/src/pages/Home.jsx frontend/src/pages/Home.test.jsx
git commit -m "feat: name Spine on the home cards"
```

### Task 6: Projects card with tagline, highlights and links

**Files:**
- Modify: `frontend/src/content/projects.js`
- Modify: `frontend/src/pages/Projects.jsx`
- Modify: `frontend/src/pages/Projects.test.jsx`
- Modify: `frontend/src/index.css:524-527` (`.project-more` replaced)

**Interfaces:**
- Consumes: `spine` (Task 4), `profile.repo` (Task 4).
- Produces: project entry shape `{ name, tagline?, description, highlights?: string[], links?: ({ to, label } | { href, label })[], tech, to?, url?, strip? }`. `more` is gone.

- [ ] **Step 1: Write the failing tests** — replace the file's `projects.js` mock and tests:

```jsx
vi.mock('../content/projects.js', () => ({
  projects: [
    {
      name: 'Spine',
      tagline: 'A tracker for a physical game collection',
      description: 'A tracker.',
      highlights: ['Photo import.', 'Play Next.'],
      links: [
        { to: '/spine', label: 'Open Spine' },
        {
          href: 'https://github.com/joeyh92989/joey-haas.dev',
          label: 'Source',
        },
      ],
      tech: ['React'],
      to: '/spine',
      url: null,
      strip: 'favourites',
    },
    {
      name: 'This Website',
      description: 'This site.',
      tech: ['Vite'],
      url: 'https://github.com/joeyh92989/joey-haas.dev',
    },
  ],
}))
```

Keep `renderProjects` and the strip test. Replace the `more` test with:

```jsx
  it('renders a tagline and highlights only where set', () => {
    const { container } = renderProjects()
    const cards = container.querySelectorAll('.project-card')
    expect(cards[0].querySelector('.project-tagline')).toHaveTextContent(
      'A tracker for a physical game collection',
    )
    expect(cards[0].querySelectorAll('.project-highlights li')).toHaveLength(2)
    expect(cards[1].querySelector('.project-tagline')).toBeNull()
    expect(cards[1].querySelector('.project-highlights')).toBeNull()
  })

  it('links in-site with the router and away with an anchor', () => {
    const { container } = renderProjects()
    expect(screen.getByRole('link', { name: /Open Spine/ })).toHaveAttribute(
      'href',
      '/spine',
    )
    expect(screen.getByRole('link', { name: /Source/ })).toHaveAttribute(
      'href',
      'https://github.com/joeyh92989/joey-haas.dev',
    )
    const cards = container.querySelectorAll('.project-card')
    expect(cards[1].querySelector('.project-links')).toBeNull()
  })
```

and in "still links each title" change `'Media Collection'` → `'Spine'` and
`'/collection'` → `'/spine'`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npm test -- src/pages/Projects.test.jsx` → tagline and links tests FAIL.

- [ ] **Step 3: Implement**

`Projects.jsx`, the article body (doc comment updated: drop the `more`
sentence, add "`tagline`, `highlights` and `links` render only when set"):

```jsx
          <article key={project.name} className="project-card">
            <h2>
              {project.to ? (
                <Link to={project.to}>{project.name}</Link>
              ) : project.url ? (
                <a href={project.url}>{project.name}</a>
              ) : (
                project.name
              )}
            </h2>
            {project.tagline && (
              <p className="project-tagline">{project.tagline}</p>
            )}
            {project.strip === 'favourites' && <CoverStrip />}
            <p>{project.description}</p>
            {project.highlights && (
              <ul className="project-highlights">
                {project.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            )}
            {project.links && (
              <p className="project-links">
                {project.links.map((link) =>
                  link.to ? (
                    <Link key={link.label} to={link.to}>
                      {link.label} &rarr;
                    </Link>
                  ) : (
                    <a key={link.label} href={link.href}>
                      {link.label} &rarr;
                    </a>
                  ),
                )}
              </p>
            )}
            <ul className="tech-list">
              {project.tech.map((tech) => (
                <li key={tech}>{tech}</li>
              ))}
            </ul>
          </article>
```

`projects.js` (header comment: replace the `more` sentence with "`tagline`,
`highlights` and `links` are optional; `links` entries take `to` for a route
or `href` for an external URL, and carry no arrow"):

```js
import { profile } from './profile.js'
import { spine } from './spine.js'

export const projects = [
  {
    name: spine.name,
    tagline: spine.projectsTagline,
    description:
      'I collect games on cartridge, and nothing tracked them the way I wanted — least of all whether a box holds the full game or a download code. Spine does. It reads a shelf from a photograph, resolves every title against IGDB, picks tonight’s game from the backlog, and watches boutique publishers for the next cartridge worth owning.',
    highlights: [
      'Photo import: a vision model reads titles off the spines; each match is scored by string distance, never by asking the model how sure it is.',
      'A physical catalogue: a community registry and twelve boutique stores, collapsed to one honest format per game — full cartridge or Game-Key Card.',
      'Play Next: six weighted terms score the backlog — mostly a taste profile built from my own ratings, favourites and finishes, plus fit and time waiting — and it says why.',
      'Discover and Radar: the model only ever picks indices from a list the server built, with a deterministic fallback when it cannot answer.',
    ],
    links: [
      { to: spine.path, label: `Open ${spine.name}` },
      spine.links.post,
      spine.links.source,
    ],
    tech: ['React', 'FastAPI', 'Postgres', 'Gemini', 'IGDB', 'TMDB', 'GitHub Actions'],
    to: spine.path,
    url: null,
    strip: 'favourites',
  },
  {
    name: 'This Website',
    description:
      'This site: a React and Vite frontend with a markdown blog compiled at build time, a FastAPI backend behind Google sign-in, Postgres on Neon, and a pull-request pipeline that deploys to Render on merge.',
    links: [
      { href: profile.repo, label: 'Source' },
      { href: `${profile.repo}/actions`, label: 'CI pipeline' },
    ],
    tech: ['React', 'Vite', 'FastAPI', 'Postgres', 'GitHub Actions', 'Render'],
    url: profile.repo,
  },
]
```

`index.css`: replace the `.project-more` rule with (the `.project-card`
prefix outranks `.project-card p`):

```css
.project-card .project-tagline {
  color: var(--text-muted);
  font-size: 0.875rem;
  margin: 0.125rem 0 0.75rem;
}

.project-highlights {
  color: var(--text-body);
  font-size: 0.875rem;
  margin: 0.625rem 0 0;
  padding-left: 1.125rem;
}

.project-highlights li + li {
  margin-top: 0.25rem;
}

.project-card .project-links {
  display: flex;
  flex-wrap: wrap;
  font-size: 0.875rem;
  gap: 0.25rem 1rem;
  margin: 0.75rem 0 0;
}
```

Run `grep -rn "project-more\|\.more\b" frontend/src` → no output.

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npm test -- src/pages/Projects.test.jsx` → pass. Prettier + ESLint on the four files.

- [ ] **Step 5: Commit** — boundary 7 (4 files)

```bash
git add frontend/src/content/projects.js frontend/src/pages/Projects.jsx frontend/src/pages/Projects.test.jsx frontend/src/index.css
git commit -m "feat: rebuild the Projects cards with highlights and links"
```

### Task 7: Footer credit

**Files:**
- Modify: `frontend/src/layouts/RootLayout.jsx:165-187`
- Modify: `frontend/src/layouts/RootLayout.test.jsx` (new describe block)
- Modify: `frontend/src/index.css:722-728`

- [ ] **Step 1: Write the failing test**

```jsx
describe('RootLayout footer', () => {
  it('credits the current year and links the source', () => {
    renderAt('/about')
    const footer = screen.getByRole('contentinfo')
    expect(footer).toHaveTextContent(`© ${new Date().getFullYear()} Joey Haas`)
    expect(
      within(footer).getByRole('link', { name: 'Source' }),
    ).toHaveAttribute('href', 'https://github.com/joeyh92989/joey-haas.dev')
  })

  it('keeps the contact links and the sign-in door', () => {
    renderAt('/about')
    const footer = within(screen.getByRole('contentinfo'))
    expect(footer.getByRole('link', { name: 'GitHub' })).toBeInTheDocument()
    expect(footer.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify the first fails**

Run: `cd frontend && npm test -- src/layouts/RootLayout.test.jsx` → "credits the current year" FAILS.

- [ ] **Step 3: Implement** — the footer becomes two groups; the second is the existing content, unchanged, inside a `<p>`:

```jsx
      <footer>
        <p className="footer-credit">
          &copy; {new Date().getFullYear()} {profile.name} &middot;{' '}
          <a href={profile.repo}>Source</a>
        </p>
        <p className="footer-links">
          <a href={`mailto:${profile.email}`}>{profile.email}</a>
          {' · '}
          <a href={profile.github}>GitHub</a>
          {profile.linkedin && (
            <>
              {' · '}
              <a href={profile.linkedin}>LinkedIn</a>
            </>
          )}
          {' · '}
          {/* Replaces having to know the /admin URL. Deliberately understated:
              it is a door for one person, not a call to action. */}
          {signedIn ? (
            <Link to="/admin" className="footer-admin">
              Admin
            </Link>
          ) : (
            <a href={loginUrl} className="footer-admin">
              Sign in
            </a>
          )}
        </p>
      </footer>
```

Update the
component doc comment: "…and a footer carrying a credit line and contact
links." The year is read at render, so it never goes stale between deploys.

`index.css` footer rule gains layout, and its paragraphs lose margins:

```css
footer {
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  display: flex;
  flex-wrap: wrap;
  font-size: 0.84375rem;
  gap: 0.375rem 1.5rem;
  justify-content: space-between;
  margin-top: 2.75rem;
  padding-top: 1.125rem;
}

/* The two groups wrap onto separate lines on a narrow screen. */
footer p {
  margin: 0;
}
```

- [ ] **Step 4: Run to verify both pass**; Prettier + ESLint on the three files.

- [ ] **Step 5: Commit** — boundary 8 (3 files)

```bash
git add frontend/src/layouts/RootLayout.jsx frontend/src/layouts/RootLayout.test.jsx frontend/src/index.css
git commit -m "feat: add a credit line to the footer"
```

### Task 8: Link-preview meta and the og card

**Files:**
- Modify: `frontend/index.html` (inside `<head>`, after `<title>`)
- Create: `frontend/public/og-card.png`
- Create: `frontend/src/meta.test.js`
- Modify: `docs/planning/2026-10-02-spine-design.md` (Meta section: how the card was made)

**Spec deviation (recorded in the spec in this commit):** the card is
rendered with headless Chrome, not `sharp`. `sharp` renders SVG through
librsvg, which cannot load the site's woff2 fonts; Chrome renders the real
Newsreader and Public Sans from `node_modules`, and needs no `npm install`.

- [ ] **Step 1: Write the failing test** — `frontend/src/meta.test.js`:

```js
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

/** The content of a meta tag, by name or property. */
function meta(key) {
  const match = html.match(
    new RegExp(`<meta\\s+(?:name|property)="${key}"\\s+content="([^"]*)"`),
  )
  return match?.[1]
}

describe('index.html meta', () => {
  it('describes the site and Spine', () => {
    expect(meta('description')).toBe(
      'Joey Haas is a senior software engineer in Denver building payments and ledger systems, and Spine, a tracker for a physical game collection.',
    )
    expect(meta('og:description')).toBe(meta('description'))
  })

  it('carries the Open Graph and card tags', () => {
    expect(meta('og:title')).toBe('Joey Haas')
    expect(meta('og:type')).toBe('website')
    expect(meta('og:url')).toBe('https://joey-haas.dev/')
    expect(meta('og:image')).toBe('https://joey-haas.dev/og-card.png')
    expect(meta('twitter:card')).toBe('summary_large_image')
  })

  // The tag must never point at nothing, and LinkedIn wants 1200×627 or more.
  it('points og:image at a 1200×630 PNG that exists', () => {
    const png = readFileSync(new URL('../public/og-card.png', import.meta.url))
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
    expect(meta('og:image:width')).toBe('1200')
    expect(meta('og:image:height')).toBe('630')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- src/meta.test.js` → FAIL (no tags, no PNG).

- [ ] **Step 3: Add the tags** to `index.html` after `<title>`:

```html
    <meta
      name="description"
      content="Joey Haas is a senior software engineer in Denver building payments and ledger systems, and Spine, a tracker for a physical game collection."
    />
    <!--
      Link previews. Crawlers do not run JavaScript, so these are static and
      site-wide; per-route meta would need prerendering.
    -->
    <meta property="og:title" content="Joey Haas" />
    <meta
      property="og:description"
      content="Joey Haas is a senior software engineer in Denver building payments and ledger systems, and Spine, a tracker for a physical game collection."
    />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://joey-haas.dev/" />
    <meta property="og:image" content="https://joey-haas.dev/og-card.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta
      property="og:image:alt"
      content="Joey Haas, senior software engineer, and Spine, a tracker for my physical game collection."
    />
    <meta name="twitter:card" content="summary_large_image" />
```

Prettier may reflow these; the test regex needs `name|property` then
`content` in that order, which Prettier preserves.

- [ ] **Step 4: Render the card** — write `$SCRATCH/og-card.html` (scratchpad, not the repo), with `FONTS=/Users/joey-haas/Developer/joey-haas.dev/frontend/node_modules/@fontsource`. Colors are the dark theme's `--bg`, `--text`, `--text-muted`, `--accent`, `--text-body` values copied from `index.css:14-21` (a standalone file cannot read the site's tokens):

```html
<!doctype html>
<meta charset="utf-8" />
<style>
  @font-face { font-family: Newsreader; font-weight: 600; src: url('file://FONTS/newsreader/files/newsreader-latin-600-normal.woff2'); }
  @font-face { font-family: 'Public Sans'; font-weight: 500; src: url('file://FONTS/public-sans/files/public-sans-latin-500-normal.woff2'); }
  html, body { margin: 0; width: 1200px; height: 630px; background: #201a14; }
  body { box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; padding: 0 96px; font-family: 'Public Sans'; font-weight: 500; }
  h1 { color: #f6eddd; font: 600 104px/1.05 Newsreader; margin: 0; }
  .role { color: #a4937c; font-size: 36px; margin: 20px 0 0; }
  hr { border: 0; border-top: 3px solid #d98e5f; margin: 48px 0; width: 120px; }
  .spine { color: #c9bba5; font-size: 34px; margin: 0; }
</style>
<h1>Joey Haas</h1>
<p class="role">Senior software engineer · Denver, Colorado</p>
<hr />
<p class="spine">Spine — a tracker for my physical game collection</p>
```

(Replace `FONTS` with the real path.) Render and check:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 --screenshot=frontend/public/og-card.png "file://$SCRATCH/og-card.html"
sips -g pixelWidth -g pixelHeight frontend/public/og-card.png
```

Expected: `pixelWidth: 1200`, `pixelHeight: 630`. Open the PNG with the Read
tool and confirm both fonts rendered (serif name, sans lines) and nothing is
clipped. If the size is wrong, enter structured debugging; do not resize the
PNG after rendering.

- [ ] **Step 5: Record it in the spec** — in the spec's Meta section replace the sentence beginning "It is generated once by a scratchpad script using `sharp`" with: "It was rendered once from a scratchpad HTML file by headless Chrome (`--headless=new --window-size=1200,630 --force-device-scale-factor=1 --screenshot`), loading the `@fontsource` woff2 files from `node_modules`, and committed as a PNG; the HTML is not committed. `sharp` was the plan, but librsvg cannot load woff2, so it would have rendered fallback fonts." Also adjust KD7's "A committed generator…" sentence to drop "`sharp` dependency".

- [ ] **Step 6: Run to verify**: `npm test -- src/meta.test.js` → pass; `npm run build` → succeeds and `ls dist/og-card.png` exists. Prettier on `index.html` and the spec.

- [ ] **Step 7: Commit** — boundary 9 (4 files)

```bash
git add frontend/index.html frontend/public/og-card.png frontend/src/meta.test.js docs/planning/2026-10-02-spine-design.md
git commit -m "feat: add link-preview meta and a 1200x630 card"
```

### Task 9: Titles — Home, About, Projects, Blog

**Files:**
- Modify: `frontend/src/pages/Home.jsx`, `About.jsx`, `Projects.jsx`, `Blog.jsx`
- Modify: `frontend/src/App.test.jsx`

**Interfaces:** consumes `usePageTitle` (Task 1); extends `App.test.jsx` (Task 2).

- [ ] **Step 1: Write the failing tests** — append to `App.test.jsx`:

```jsx
/** [path, title]; each later task adds its routes' rows. */
const TITLES = [
  ['/', 'Joey Haas — Senior software engineer, Denver'],
  ['/about', 'About · Joey Haas'],
  ['/projects', 'Projects · Joey Haas'],
  ['/blog', 'Blog · Joey Haas'],
]

describe('App page titles', () => {
  beforeEach(() => {
    document.title = 'Stale'
  })

  it.each(TITLES)('titles %s', async (path, title) => {
    renderAt(path)
    await waitFor(() => expect(document.title).toBe(title))
  })
})
```

- [ ] **Step 2: Run to verify they fail**: `npm test -- src/App.test.jsx` → four title rows FAIL ("Stale").

- [ ] **Step 3: Implement** — in each page add `import { usePageTitle } from '../lib/usePageTitle.js'` and, as the first line of the default-exported component:

| File | Line |
|---|---|
| `Home.jsx` | `usePageTitle('Joey Haas — Senior software engineer, Denver')` |
| `About.jsx` | `usePageTitle('About · Joey Haas')` |
| `Projects.jsx` | `usePageTitle('Projects · Joey Haas')` |
| `Blog.jsx` | `usePageTitle('Blog · Joey Haas')` |

- [ ] **Step 4: Run to verify they pass**: `npm test` (whole suite). Prettier + ESLint on the five files.

- [ ] **Step 5: Commit** — boundary 10 (5 files)

```bash
git add frontend/src/pages/Home.jsx frontend/src/pages/About.jsx frontend/src/pages/Projects.jsx frontend/src/pages/Blog.jsx frontend/src/App.test.jsx
git commit -m "feat: title the static public pages"
```

### Task 10: Titles — NotFound, BlogPost, the shelf

**Files:**
- Modify: `frontend/src/pages/NotFound.jsx`, `BlogPost.jsx`, `Collection.jsx`
- Modify: `frontend/src/App.test.jsx`

- [ ] **Step 1: Write the failing tests** — add to `TITLES`:

```jsx
  ['/spine', 'Spine · Joey Haas'],
  ['/nonsense-path', 'Not found · Joey Haas'],
  ['/blog/no-such-post', 'Not found · Joey Haas'],
```

and inside `describe('App page titles')`:

```jsx
  it('titles a post by its own title', async () => {
    content.posts.push({
      slug: 'how-spine-works',
      html: '<p>Body</p>',
      frontmatter: { title: 'How Spine works', date: '2026-10-02', tags: [] },
    })
    renderAt('/blog/how-spine-works')
    await waitFor(() =>
      expect(document.title).toBe('How Spine works · Joey Haas'),
    )
  })
```

- [ ] **Step 2: Run to verify they fail**: `npm test -- src/App.test.jsx` → the four new cases FAIL.

- [ ] **Step 3: Implement** (import `usePageTitle` in each):
  - `NotFound.jsx`, first line: `usePageTitle('Not found · Joey Haas')`.
  - `BlogPost.jsx`, after `const post = findPost(slug)` and **before** `if (!post) return <NotFound />`:
    ```jsx
    // Null when missing, so NotFound's own title stands (see usePageTitle).
    usePageTitle(post ? `${post.frontmatter.title} · Joey Haas` : null)
    ```
  - `Collection.jsx`, first line of `Collection()`:
    ```jsx
    usePageTitle(`${spine.name} · Joey Haas`)
    ```

- [ ] **Step 4: Run to verify they pass**: `npm test`. Prettier + ESLint on the four files.

- [ ] **Step 5: Commit** — boundary 11 (4 files)

```bash
git add frontend/src/pages/NotFound.jsx frontend/src/pages/BlogPost.jsx frontend/src/pages/Collection.jsx frontend/src/App.test.jsx
git commit -m "feat: title the shelf, posts and the 404"
```

### Task 11: Title — item page

**Files:**
- Modify: `frontend/src/pages/Item.jsx` (`ItemPage`, before `if (result.state === 'missing')`)
- Modify: `frontend/src/pages/Item.test.jsx`

- [ ] **Step 1: Write the failing tests** — append:

```jsx
describe('Item title', () => {
  beforeEach(() => {
    document.title = 'Stale'
  })

  it('is Spine until the item is known', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    renderPage()
    expect(document.title).toBe('Spine · Joey Haas')
  })

  it('names the item once it loads', async () => {
    stubItem()
    await renderReady()
    expect(document.title).toBe('Hades · Spine')
  })

  it('names the item from the snapshot while the server wakes', async () => {
    vi.mocked(readSnapshot).mockResolvedValue([
      { id: ID, type: 'game', title: 'Hades', cover_url: null },
    ])
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    renderPage()
    await waitFor(() => expect(document.title).toBe('Hades · Spine'))
  })

  it('leaves the title to NotFound on a 404', async () => {
    stubApi({ ok: false, status: 404, json: async () => ({}) })
    renderPage()
    await screen.findByRole('heading', { name: 'Not found' })
    expect(document.title).toBe('Not found · Joey Haas')
  })
})
```

- [ ] **Step 2: Run to verify they fail**: `npm test -- src/pages/Item.test.jsx` → the first three FAIL with "Stale". The 404 test already passes (NotFound titles itself since Task 10); it stays as the guard that this task's hook passes null on a 404 rather than overwriting NotFound.

- [ ] **Step 3: Implement** — `import { usePageTitle } from '../lib/usePageTitle.js'`; in `ItemPage`, after the effects and before the first `return`:

```jsx
  const shown = result.state === 'ready' ? result.item : preview
  // Null on a 404, so NotFound's own title stands (see usePageTitle).
  usePageTitle(
    result.state === 'missing'
      ? null
      : shown
        ? `${shown.title} · Spine`
        : 'Spine · Joey Haas',
  )
```

- [ ] **Step 4: Run to verify they pass**; Prettier + ESLint.

- [ ] **Step 5: Commit** — boundary 12 (2 files)

```bash
git add frontend/src/pages/Item.jsx frontend/src/pages/Item.test.jsx
git commit -m "feat: title the item page"
```

### Task 12: Titles — first four admin pages

**Files:**
- Modify: `frontend/src/pages/Admin.jsx`, `AdminCollection.jsx`, `AdminImport.jsx`, `PlayNext.jsx`
- Modify: `frontend/src/App.test.jsx`

- [ ] **Step 1: Write the failing tests** — add to `TITLES`:

```jsx
  ['/admin', 'Admin · Joey Haas'],
  ['/admin/collection', 'Collection · Admin'],
  ['/admin/import', 'Import from photos · Admin'],
  ['/admin/play-next', 'Play Next · Admin'],
```

- [ ] **Step 2: Run to verify they fail**: `npm test -- src/App.test.jsx` → four FAIL.

- [ ] **Step 3: Implement** — import `usePageTitle`; first line of each default export:

| File | Line |
|---|---|
| `Admin.jsx` | `usePageTitle('Admin · Joey Haas')` |
| `AdminCollection.jsx` | `usePageTitle('Collection · Admin')` |
| `AdminImport.jsx` | `usePageTitle('Import from photos · Admin')` |
| `PlayNext.jsx` | `usePageTitle('Play Next · Admin')` |

- [ ] **Step 4: Run to verify they pass**: `npm test`. Prettier + ESLint on the five files.

- [ ] **Step 5: Commit** — boundary 13 (5 files)

```bash
git add frontend/src/pages/Admin.jsx frontend/src/pages/AdminCollection.jsx frontend/src/pages/AdminImport.jsx frontend/src/pages/PlayNext.jsx frontend/src/App.test.jsx
git commit -m "feat: title the admin home, collection, import and Play Next"
```

### Task 13: Titles — remaining admin pages, full route table

**Files:**
- Modify: `frontend/src/pages/AdminCatalogue.jsx`, `AdminRadar.jsx`, `AdminDiscover.jsx`, `AdminItem.jsx`
- Modify: `frontend/src/App.test.jsx`

- [ ] **Step 1: Write the failing tests** — add to `TITLES`:

```jsx
  ['/admin/catalogue', 'Catalogue · Admin'],
  ['/admin/radar', 'Radar · Admin'],
  ['/admin/discover', 'Discover · Admin'],
  ['/admin/collection/42', 'Item · Admin'],
  ['/spine/42', 'Spine · Joey Haas'],
```

and one guard inside `describe('App page titles')`, so a route added to
`App.jsx` without a row is noticed:

```jsx
  // One row per route in App.jsx (18) minus the two /collection redirects,
  // which set no title. /blog/:slug's row is the missing-post case; the
  // published case has its own test above. A new route without a row
  // fails here.
  it('covers every titled route', () => {
    expect(TITLES).toHaveLength(16)
  })
```

Before running, confirm the count: `grep -c '<Route path=\|<Route index' frontend/src/App.jsx` → 18.

- [ ] **Step 2: Run to verify they fail**: four admin rows FAIL; `/spine/42` and the guard (16 rows) pass already, and stay as coverage.

- [ ] **Step 3: Implement** — import `usePageTitle`:

| File | Line, first in the default export unless noted |
|---|---|
| `AdminCatalogue.jsx` | `usePageTitle('Catalogue · Admin')` |
| `AdminRadar.jsx` | `usePageTitle('Radar · Admin')` |
| `AdminDiscover.jsx` | `usePageTitle('Discover · Admin')` |
| `AdminItem.jsx` | after `const [item, setItem] = useState(null)` — see below |

```jsx
  usePageTitle(item ? `${item.title} · Admin` : 'Item · Admin')
```

- [ ] **Step 4: Run to verify they pass**: `npm test`. Prettier + ESLint on the five files.

- [ ] **Step 5: Commit** — boundary 14 (5 files)

```bash
git add frontend/src/pages/AdminCatalogue.jsx frontend/src/pages/AdminRadar.jsx frontend/src/pages/AdminDiscover.jsx frontend/src/pages/AdminItem.jsx frontend/src/App.test.jsx
git commit -m "feat: title the remaining admin pages"
```

### Task 14: Recent picks empty covers — root cause only

No files change in this task. Structured-debugging rules apply: reproduce,
hypothesise, investigate one at a time, **stop at root cause**.

- [ ] **Step 1: Reproduce on production** — open `https://joey-haas.dev/collection` in the browser pane; confirm empty cover boxes under "Recent picks"; note whether "Coming to cartridge" shows covers.
- [ ] **Step 2: Hypothesis A, null data** — `curl -s -m 120 https://api.joey-haas.dev/api/public/picks | python3 -m json.tool`; record `title` and `cover_url` for each pick, then fetch one non-null `cover_url` with `curl -sI` and record the status.
- [ ] **Step 3: Hypothesis B, clipping** — only if A is ruled out. `cd frontend && npm run snapshot` (writes the gitignored snapshot from production), start the `frontend` preview, open `/spine`, and with `javascript_tool` read `getBoundingClientRect()` and computed `width`/`height`/`aspect-ratio` of `.recent-pick-cover`, its `.cover` and the `img`, beside the same for `.coming-cover`.
- [ ] **Step 4: Write the finding** for the checkpoint: the confirmed cause with the exact evidence (JSON rows or measured sizes), and the proposed fix: data (Joey re-links the item at `/admin/collection/:id`) or CSS (Task 18). No fix is applied in Zone 1.

### Task 15: Post review — drift list only

No files change. Read `frontend/posts/how-spine-works.md` against the
sources it names and produce a table for the checkpoint:

| Post line | Claim | Source (file:line) | Holds? | Proposed new line |

Check every number and rule: `backend/matching.py` thresholds,
`PICKER_WEIGHTS` and `MOOD_BUCKETS` (`backend/picker.py`), `DISCOVER_WEIGHTS`,
`POPULARITY_WEIGHT`, `BUYABLE_BONUS`, `UNKNOWN_FORMAT_PENALTY`
(`backend/discover.py`), `TASTE_WEIGHTS`, `URGENCY_BONUS`, `URGENCY_DAYS`
(`backend/radar.py`), the collapse rule (`backend/physical_sources/collapse.py`),
`load_public_picks` (`backend/public_outputs.py`), `schema_check`, the store
count (`STORES` in `backend/physical_sources/stores.py`), and the workflows
in `.github/workflows/`. Also check every internal link resolves to a route
in `App.jsx`. Only rows that fail are proposed for change; the voice stays.

## CHECKPOINT — Zone 1 batch review

Batch Review Protocol: `git log --oneline <zone-start>..HEAD` with files,
diffstat and rationale per commit; the self code review checklist; Task 14's
root cause; Task 15's drift table for approval row by row. Write the
zone-exit file if the notifier hook is installed. **Stop for Joey.**

## Zone 2

### Task 16: Publish the post

**Files:** Modify `frontend/posts/how-spine-works.md`

- [ ] **Step 1:** Apply only the drift rows Joey approved, exactly as approved.
- [ ] **Step 2:** Set `draft: false` in the frontmatter.
- [ ] **Step 3: Verify** — `cd frontend && npm run build`; then `grep -l "How Spine works" dist/assets/*.js` prints a file (production compiles drafts to null, so this proves it is published); `npm test` green.
- [ ] **Step 4: Commit** — boundary 15 (1 file)

```bash
git add frontend/posts/how-spine-works.md
git commit -m "feat: publish How Spine works"
```

### Task 17: Docs follow the rename

**Files:** Modify `CLAUDE.md`, `README.md`

- [ ] **Step 1:** `grep -n "/collection" CLAUDE.md README.md`. Change present-tense descriptions of the **public** route to `/spine` / `/spine/:id`: CLAUDE.md's architecture note ("Public pages other than `/collection*`"), the tracker-shelf convention ("one design system for `/collection` and `/admin/collection`"), and the Media tracker section's public mentions ("`/collection` and `/collection/:id` are public", "nothing reaches `/collection`", "shown on `/collection`"). Leave `/admin/collection`, `/api/*`, and the completed TODO entries (they are history) as they are.
- [ ] **Step 2:** Add to CLAUDE.md's TODO, after the Showcase entry:

```markdown
- [x] Spine — the tracker's public name. `/spine` and `/spine/:id`, with
      client-side redirects from `/collection*` (smoke cannot see them;
      verified in the browser), Spine copy in `content/spine.js`, the
      Projects card's `tagline`/`highlights`/`links`, `usePageTitle` on every
      page, static link-preview meta with `public/og-card.png`, and the
      "How Spine works" post. Spec and plan: `docs/planning/2026-10-02-spine-*`
```

- [ ] **Step 3:** README: the routes table row becomes `/spine` · Spine (and add a `/collection` row: "Redirects to `/spine`"); the prose at ~37 and ~388 says `/spine`. The "Collection snapshot" heading and its anchor stay.
- [ ] **Step 4:** `npx prettier --check ../CLAUDE.md ../README.md` from `frontend/` (fix if needed).
- [ ] **Step 5: Commit** — boundary 16 (2 files)

```bash
git add CLAUDE.md README.md
git commit -m "docs: document Spine and the /spine routes"
```

### Task 18 (conditional): Recent picks CSS fix

Only if Task 14's root cause was clipping **and** Joey approved the fix at
the checkpoint. Files: `frontend/src/index.css` and, if the cause is
testable in jsdom (a missing class or wrapper), `Collection.test.jsx`.
Steps: write the failing test where one is possible; apply the approved
CSS; verify in the preview at desktop and 375px that the covers render;
`npm test`; commit `fix: render covers in Recent picks` (≤2 files). If the
cause was data, this task is skipped and the checkpoint records that Joey
re-links the item.

### Task 19: Browser checks (local)

No files. Start the `frontend` preview (after `npm run snapshot`):

- [ ] `/collection` lands on `/spine`, `/collection/<real id>` on `/spine/<id>`; Back from `/spine` does not return to `/collection`.
- [ ] Spine nav item is active on `/spine` and on an item page.
- [ ] Every title in the spec's table, read with `javascript_tool` (`document.title`).
- [ ] Dark and light theme, at desktop and 375px (`resize_window`), on `/`, `/projects`, `/spine` and one item page: header block, highlights and links rows wrap; cover strips do not overflow (`document.documentElement.scrollWidth <= innerWidth`); footer groups stack.
- [ ] No console errors on any of them (`read_console_messages`).
- [ ] Screenshots of `/spine` header and the Projects card, both themes.

## CHECKPOINT — Zone 2 batch review + finish gate

Batch Review Protocol for Zone 2, then the finish gate: `npm test`,
`npm run lint`, `npm run format:check`, `npm run build`, backend
`./.venv/bin/pytest` (untouched, green); the branch diff touches 4+ files,
so **ultra review** (parallel reviewers per dimension, each finding
adversarially verified). Fix confirmed findings in boundary commits. Exit
state: clean review, drafted PR description, zone-exit file. **Stop for
Joey**, who pushes, merges and deploys.

## Zones

```
Zone 1 (auto): tasks 1–15
CHECKPOINT — batch review + post drift approval + Recent picks root cause
Zone 2 (auto): tasks 16–19
CHECKPOINT — batch review + finish gate
```

No infra, CI, migration or deploy-path change: `render.yaml`, workflows and
the backend are untouched, so no carve-out zone. `index.html` meta is
frontend markup, not infra.

## Automated environment tests

- **Smoke util exists:** `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev` (repo root). No new checks (it cannot see client routes; Task 3 adds the comment saying so). Passing: every line PASS, exit 0.
- **After Joey deploys**, run in addition:
  - `curl -s https://joey-haas.dev/ | grep -E 'og:|twitter:|name="description"'` → all ten tags present with the values in Task 8.
  - `curl -sI https://joey-haas.dev/og-card.png` → `200` and `content-type: image/png` (a real file, not the SPA fallback's `text/html`).
  - Browser pane on production: `/collection` → `/spine`, `/collection/<id>` → `/spine/<id>`, titles on `/`, `/spine`, one item, `/blog/how-spine-works`; Blog in the nav and the Home "Latest" block present; Recent picks covers render (after Joey's re-link if the cause was data).
- **Observability:** the static site has no runtime logs; the backend is unchanged, so its Render logs should show no new errors for `/api/public/*` during the checks (search by URL with `&q=`, per memory). Green smoke plus a new error in the logs is **not done**; red enters structured debugging.
