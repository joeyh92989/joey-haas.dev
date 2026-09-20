# Resume copy sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the site's About and Home copy, its toolbox chips, and its published PDF back in line with the rewritten 2026 resume, and add an Areas of expertise section.

**Architecture:** All copy lives in `frontend/src/content/*.js`, which page components read at render time; the About page holds the markup. This change edits two content modules, adds one array export and one page section with its CSS, and replaces a static asset. No new module, no backend change, no new dependency.

**Tech Stack:** Vite + React 19, plain CSS with design tokens in `frontend/src/index.css`, Vitest + Testing Library, Prettier, ESLint.

**Spec:** `docs/planning/2026-09-18-resume-copy-sync-design.md`

## Global Constraints

- Style with CSS variables only. A literal hex is wrong in one of the two themes.
- Copy strings are exact. Em dashes are `—`, middots are `·`, and the arrow in a role label is `→`.
- `frontend/public/resume.pdf` keeps that exact path and filename. It is the URL already pasted into job applications.
- Every entry in `profile.expertise` and `profile.toolbox` must be unique across both arrays; the tests assert with `getByText`, which throws on a duplicate match.
- Run `npm run format` and `npm run lint` in `frontend/` after every file change; fix errors before moving on.
- Run `npm test` in `frontend/` after every task; a red suite is never carried into the next task.
- Commits happen on `resume-copy-sync`. Never on `main`, never a push, merge, or rebase.
- Every commit message ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Zones

```
Zone 1 (auto): tasks 1–4
CHECKPOINT — batch review + finish gate
```

No task touches infrastructure, CI, a migration, or the deploy path, so the whole plan is one zone.

---

### Task 1: Content modules carry the new resume's facts

**Files:**
- Modify: `frontend/src/content/profile.js`
- Modify: `frontend/src/content/experience.js`
- Test: `frontend/src/pages/About.test.jsx` (existing, unchanged — its assertions iterate the exports, so they re-verify the new values automatically)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `profile.expertise` — `string[]`, eight entries, consumed by Task 2's About section. `profile.bio` and `profile.toolbox` keep their existing types (`string`, `string[]`).

- [ ] **Step 1: Run the suite to confirm a green baseline**

```bash
cd frontend && npm test
```

Expected: PASS, all suites.

- [ ] **Step 2: Rewrite the bio's first paragraph in `content/profile.js`**

Replace this line:

```js
  bio: `I'm a senior software engineer at Guild, where since 2021 I've built and owned the backend payments and benefits systems that fund, track, and reconcile every learner benefit dollar — spend-writing APIs, funding context, tax classification, and the eligibility migration underneath them.
```

with:

```js
  bio: `I'm a senior software engineer at Guild, where five years on the payments team have gone into the backend systems that fund, track, and reconcile every learner benefit dollar — spend-writing APIs, funding context, tax classification, and the eligibility migration underneath them.
```

The second paragraph of the template literal is unchanged.

- [ ] **Step 3: Add the `expertise` export to the `profile` object in `content/profile.js`**

Insert immediately before the `/** Rendered as the About page's chip row, in this order. */` comment:

```js
  /**
   * Rendered as the About page's Areas of expertise list, in this order.
   *
   * These describe work, not tooling — the toolbox chips below carry the
   * tools. An entry belongs in exactly one of the two lists, because both
   * are asserted with an exact-text query that throws on a duplicate.
   */
  expertise: [
    'Backend & API design',
    'Payments & ledger systems',
    'Distributed systems',
    'Event-driven architecture',
    'Data modeling & database design',
    'Data migrations & backfills',
    'System architecture & ADRs',
    'Observability, alerting & incident forensics',
  ],
```

- [ ] **Step 4: Replace the `toolbox` array in `content/profile.js`**

Replace the whole existing array body with:

```js
  toolbox: [
    'Node.js',
    'TypeScript',
    'Python · FastAPI',
    'React',
    'SQL · PostgreSQL',
    'Snowflake',
    'GraphQL (AppSync)',
    'AWS (Lambda, RDS)',
    'REST API design',
    'Mocha · Chai · Sinon',
    'Integration testing · BDD',
    'Snyk',
    'Salesforce · NetSuite',
    'GitHub Actions CI',
  ],
```

`Event-driven integration` and `Distributed systems` are gone from this list on purpose — both moved into `expertise` in Step 3.

- [ ] **Step 5: Update both Guild entries in `content/experience.js`**

In the first entry, change `role`, `company`, and `summary`. `meta` and `current` are shown here unchanged, for context:

```js
    role: 'Software Engineer I → II → Senior',
    company: 'Guild',
    meta: '2021 – present · Denver, CO',
    summary:
      'Spend-writing APIs, funding context, tax classification, and the eligibility-platform migration underneath them — owned from API contract through rollout, alerting, and incident forensics.',
    current: true,
```

In the second entry (`Product Manager, Payment Products`), change only the company:

```js
    company: 'Guild',
```

Leave the MJ Freeway, Charter Communications, and iBAHN entries untouched.

- [ ] **Step 6: Format, lint, and run the suite**

```bash
cd frontend && npm run format && npm run lint && npm test
```

Expected: Prettier writes, ESLint reports no errors, all suites PASS. The existing `renders each bio paragraph`, `renders every experience entry`, and `renders every toolbox chip` cases now assert the new strings, because they read them from the modules.

Note: `renders every experience entry` calls `getAllByText(entry.company)` — plural — so both Guild rows sharing the company string `Guild` is expected and green.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/content/profile.js frontend/src/content/experience.js
git commit -m "$(cat <<'EOF'
content: sync profile and experience with the 2026 resume

The rewritten resume drops internal codenames and the former employer
name, and reframes five years of engineering around the payments team
rather than a start date. Adds the expertise list the About page renders
next, and moves distributed systems and event-driven architecture out of
the toolbox chips, where they described work rather than a tool.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Areas of expertise renders on the About page

**Files:**
- Modify: `frontend/src/pages/About.test.jsx` (add one case)
- Modify: `frontend/src/pages/About.jsx:67` (insert a section before the Toolbox section)
- Modify: `frontend/src/index.css:419` (add a rule block before the `/* ---------- Projects ---------- */` comment)

**Interfaces:**
- Consumes: `profile.expertise` (`string[]`) from Task 1.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

Add this case to `frontend/src/pages/About.test.jsx`, immediately after the `renders every toolbox chip` case:

```jsx
  it('renders every area of expertise', () => {
    render(<About />)
    expect(
      screen.getByRole('heading', { name: 'Areas of expertise' }),
    ).toBeInTheDocument()
    expect(profile.expertise.length).toBeGreaterThan(0)
    for (const area of profile.expertise) {
      expect(screen.getByText(area)).toBeInTheDocument()
    }
  })
```

No new import is needed; `profile` is already imported at the top of the file.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npm test -- --reporter=verbose -t "renders every area of expertise"
```

Expected: FAIL — `Unable to find an accessible element with the role "heading" and name "Areas of expertise"`.

- [ ] **Step 3: Add the section to `pages/About.jsx`**

Insert this section immediately before the existing `<section>` that contains `<h2>Toolbox</h2>`:

```jsx
      <section>
        <h2>Areas of expertise</h2>
        <ul className="expertise-list">
          {profile.expertise.map((area) => (
            <li key={area}>{area}</li>
          ))}
        </ul>
      </section>
```

- [ ] **Step 4: Add the CSS to `index.css`**

Insert immediately after the `.chip-list li { ... }` rule and before the `/* ---------- Projects ---------- */` comment:

```css
/* Grid rather than CSS multi-column: multicol needs break-inside: avoid on
   every item to stop an entry splitting across the column boundary, and it
   does not collapse to a single column on a narrow screen without a media
   query. auto-fit does both for free. */
.expertise-list {
  display: grid;
  gap: 0.5rem 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  list-style: none;
  margin-top: 0.875rem;
}

.expertise-list li {
  border-left: 2px solid var(--border);
  color: var(--text-body);
  font-size: 0.875rem;
  padding-left: 0.75rem;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd frontend && npm test -- --reporter=verbose -t "renders every area of expertise"
```

Expected: PASS.

- [ ] **Step 6: Format, lint, and run the whole suite**

```bash
cd frontend && npm run format && npm run lint && npm test
```

Expected: all suites PASS, no ESLint errors.

- [ ] **Step 7: Verify both themes and both widths in the browser**

Start the dev server and open `/about`. Confirm, at desktop width: the expertise list renders in two columns above Toolbox, each item with a left rule. Narrow the window below roughly 480px: it collapses to one column with no horizontal scroll. Toggle the theme: the left rule and text both remain legible, since both use tokens. Console: clean.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/About.test.jsx frontend/src/pages/About.jsx frontend/src/index.css
git commit -m "$(cat <<'EOF'
feat(about): add an Areas of expertise section

The resume leads with fifteen areas of expertise; the site had nowhere to
put them. Renders the engineering-weighted eight as a responsive grid
rather than a third chip row, so what I do reads differently from what I
use.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Home intro and README track the change

**Files:**
- Modify: `frontend/src/pages/Home.jsx:19-24`
- Modify: `README.md:62`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Update the Home intro**

In `frontend/src/pages/Home.jsx`, replace:

```jsx
        I&rsquo;m a senior software engineer at Guild, building the payments
        systems behind employer-funded education. Eight years as a product
        manager first &mdash; so I care as much about <em>why</em> we build
        things as how.
```

with:

```jsx
        I&rsquo;m a senior software engineer at Guild, building the payments
        and ledger systems behind employer-funded education. Eight years as a
        product manager first &mdash; so I care as much about <em>why</em> we
        build things as how.
```

Prettier owns the line wrapping here; run it and accept whatever reflow it produces.

- [ ] **Step 2: Update the README's content-module list**

In `README.md`, replace:

```markdown
- `profile.js` — name, tagline, bio, contact links
```

with:

```markdown
- `profile.js` — name, tagline, bio, contact links, areas of expertise,
  toolbox chips
```

- [ ] **Step 3: Format, lint, and run the suite**

```bash
cd frontend && npm run format && npm run lint && npm test
```

Expected: all suites PASS. There is no `Home.test.jsx`, so nothing asserts the intro string; the check here is that the suite stays green and Prettier leaves the file stable.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Home.jsx README.md
git commit -m "$(cat <<'EOF'
content: say ledger systems on the landing page

The resume now frames the work as payments and ledger platforms, and the
landing page was the last surface still saying payments alone. Records
the new profile exports in the README's content-module list.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Publish the current resume PDF

**Files:**
- Modify: `frontend/public/resume.pdf` (binary replacement)
- Test: `frontend/src/pages/About.test.jsx` (existing `ships the linked PDF` case, unchanged)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Replace the file in place**

```bash
cp "/Users/joey-haas/Documents/resume/Joseph Haas Resume 2026.pdf" frontend/public/resume.pdf
```

Do not rename it, and do not publish the ATS export.

- [ ] **Step 2: Verify the copy is byte-identical to the source**

```bash
cmp "/Users/joey-haas/Documents/resume/Joseph Haas Resume 2026.pdf" frontend/public/resume.pdf && echo identical
```

Expected: `identical`, with no `differ` line.

- [ ] **Step 3: Run the suite**

```bash
cd frontend && npm test
```

Expected: PASS, including `ships the linked PDF`, which reads the file and asserts the `%PDF-` magic bytes.

- [ ] **Step 4: Build and confirm the asset ships unhashed**

```bash
cd frontend && npm run build && cmp public/resume.pdf dist/resume.pdf && echo shipped
```

Expected: the build succeeds and prints `shipped`. Vite copies `public/` to `dist/` root without hashing, which is what keeps `/resume.pdf` a stable URL.

- [ ] **Step 5: Commit**

```bash
git add frontend/public/resume.pdf
git commit -m "$(cat <<'EOF'
content: publish the current resume PDF

Replaces the 2026-09-01 export with the rewritten resume the rest of this
branch syncs the site to. Same path and filename: the URL is already in
circulation. Verified to carry no phone number and no street address.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Automated environment tests

A smoke utility already exists at `./scripts/smoke.sh <frontend-url> <api-url>`. It runs after deploy and already asserts that `GET /resume.pdf` returns 200 with `content-type: application/pdf`, which re-verifies the replaced file. **No change to the script is needed for this branch.**

Invocation, after Joey merges and Render finishes both deploys:

```bash
./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev
```

Passing looks like: every check reports pass, with no failures in the summary line. Then confirm health in Render's logs for both services — a green smoke run alongside fresh errors in the logs is not done.

Before any deploy, locally:

- `cd frontend && npm test` — green, including the new expertise case.
- `cd frontend && npm run build` — succeeds, `dist/resume.pdf` present and matching.
- `/about` in both themes at desktop and phone width — expertise grid reflows, resume link downloads the new file, console clean.

## Finish gate

After Task 4, before calling the branch done:

1. Mechanical preflight: `npm test`, `npm run lint`, `npm run format:check`, `npm run build` — all green.
2. Review the full branch diff against `main`. Six files change and none is infra, but the diff spans four commits, so this runs as a single reviewer subagent on the full checklist rather than an ultra review.
3. Fix confirmed findings on-branch with normal boundary commits; a fix that expands scope stops and flags Joey.
4. Exit state: clean review, drafted PR description, zone-exit signal written. Joey pushes.
