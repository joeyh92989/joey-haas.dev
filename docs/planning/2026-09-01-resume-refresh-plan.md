# Resume Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the site's copy in line with the 2026 resume and publish a downloadable PDF at a stable URL.

**Architecture:** All copy lives in `frontend/src/content/*.js`; pages read from those modules and never hold text inline. A new `content/education.js` joins `profile.js` and `experience.js`. The About page gains an Education section built from the existing `.timeline` and `.chip-list` styles, so no CSS changes. The resume PDF ships through Vite's `public/` directory, which copies it unhashed to `dist/` root and serves it at `/resume.pdf`.

**Tech Stack:** React 19, Vite 6, react-router 8 (declarative, import from `react-router`), Vitest 4 + Testing Library, Prettier, ESLint, deployed as a Render static site.

**Spec:** `docs/planning/2026-09-01-resume-refresh-design.md`

## Global Constraints

- Branch: `resume-refresh-2026`. Never commit on `main`; never push, merge, or rebase.
- No new dependencies, no new CSS rules, no backend or `render.yaml` changes.
- Style only with the CSS custom properties in `index.css`; never a literal color.
- Copy source of truth is `~/Downloads/Joseph Haas Resume (web).pdf` (phone-free export).
- No phone number and no street address anywhere in the repo.
- Employer renders as `Guild (formerly Guild Education)` in `experience.js`; prose says `Guild`.
- Every text string lives in `frontend/src/content/`, not inline in a page — the one exception is the Home intro, which carries markup and is documented as such in `Home.jsx`.
- Run `npx prettier --write` and `npx eslint` on every changed frontend file before its commit.
- Run `npm test` after every task; the suite must be green before committing.

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `frontend/src/content/education.js` | create | Degrees, bootcamp, certifications |
| `frontend/src/content/profile.js` | modify | Name, tagline, bio, contact links, toolbox |
| `frontend/src/content/experience.js` | modify | Work history entries |
| `frontend/src/pages/About.jsx` | modify | Renders bio, resume link, experience, education, toolbox |
| `frontend/src/pages/About.test.jsx` | create | Asserts About renders each content module |
| `frontend/src/pages/Home.jsx` | modify | Landing intro copy |
| `frontend/public/resume.pdf` | create | Downloadable resume, served at `/resume.pdf` |
| `scripts/smoke.sh` | modify | Post-deploy check that `/resume.pdf` is a real PDF |
| `README.md`, `CLAUDE.md` | modify | Document the new content module and public asset |

## Zones

```
Zone 0 (setup): task 1 (branch)
Zone 1 (auto): tasks 2-5
CHECKPOINT — batch review
Zone 2 (auto): tasks 6-8 (published PDF, smoke check, docs)
CHECKPOINT — batch review + finish gate
```

Zone 2 is carved out because task 6 publishes a personal document to a crawlable URL and puts a binary in git history — worth its own review before it ships.

---

### Task 1: Create the working branch

**Files:** none

**Interfaces:**
- Consumes: nothing
- Produces: branch `resume-refresh-2026` checked out, for every later commit

- [ ] **Step 1: Confirm a clean starting point**

Run: `git status --short`
Expected: only the pre-existing untracked `docs/` and modified `CLAUDE.md`, `backend/env.example`. If anything else is dirty, stop and report.

- [ ] **Step 2: Create and check out the branch**

```bash
git checkout -b resume-refresh-2026
```

- [ ] **Step 3: Verify**

Run: `git branch --show-current`
Expected: `resume-refresh-2026`

---

### Task 2: Education content module and the About Education section

**Files:**
- Create: `frontend/src/content/education.js`
- Create: `frontend/src/pages/About.test.jsx`
- Modify: `frontend/src/pages/About.jsx`

**Interfaces:**
- Consumes: `experience` from `content/experience.js`, `profile` from `content/profile.js` (both already exist)
- Produces: named exports `education` (array of `{credential, school, meta}`) and `certifications` (array of strings) from `content/education.js`; an About page with an `Education` heading

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/About.test.jsx`:

```jsx
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { certifications, education } from '../content/education.js'
import { experience } from '../content/experience.js'
import { profile } from '../content/profile.js'
import About from './About.jsx'

describe('About', () => {
  it('renders each bio paragraph from the profile module', () => {
    render(<About />)
    for (const paragraph of profile.bio.split('\n\n').filter(Boolean)) {
      expect(screen.getByText(paragraph)).toBeInTheDocument()
    }
  })

  it('renders every experience entry', () => {
    render(<About />)
    for (const entry of experience) {
      expect(screen.getByText(entry.role)).toBeInTheDocument()
      expect(screen.getAllByText(entry.company).length).toBeGreaterThan(0)
    }
  })

  it('renders every toolbox chip', () => {
    render(<About />)
    for (const tool of profile.toolbox) {
      expect(screen.getByText(tool)).toBeInTheDocument()
    }
  })

  it('renders education entries and certifications', () => {
    render(<About />)
    expect(
      screen.getByRole('heading', { name: 'Education' }),
    ).toBeInTheDocument()
    for (const entry of education) {
      expect(screen.getByText(entry.credential)).toBeInTheDocument()
      expect(screen.getByText(entry.school)).toBeInTheDocument()
    }
    for (const certification of certifications) {
      expect(screen.getByText(certification)).toBeInTheDocument()
    }
  })
})
```

Note: `About` renders no router links, so no `MemoryRouter` wrapper is needed — unlike `Admin.test.jsx`, which wraps because `Admin` reads the location.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/About.test.jsx`
Expected: FAIL — `Failed to resolve import "../content/education.js"`

- [ ] **Step 3: Create the education content module**

Create `frontend/src/content/education.js`:

```js
/**
 * Schooling and certifications for the About page, newest first.
 *
 * Separate from experience.js because the shape differs — a credential has an
 * issuing school rather than a role and an employer — even though both render
 * through the same timeline markup.
 *
 * @typedef {object} EducationEntry
 * @property {string} credential Program or degree earned.
 * @property {string} school Issuing institution.
 * @property {string} meta Year and location, rendered in uppercase.
 *
 * @type {EducationEntry[]}
 */
export const education = [
  {
    credential: 'Back-End Engineering Program',
    school: 'Turing School of Software and Design',
    meta: '2021 · Remote',
  },
  {
    credential: 'B.S. International Business, minor in Marketing',
    school: 'University of Denver',
    meta: '2012 · Denver, CO',
  },
]

/** Rendered as a chip row beneath the education timeline, in this order. */
export const certifications = [
  'Certified Scrum Product Owner',
  'Pragmatic Marketing Certified',
]
```

- [ ] **Step 4: Add the Education section to About**

In `frontend/src/pages/About.jsx`, add the import beneath the existing ones:

```jsx
import { certifications, education } from '../content/education.js'
```

Then insert this section between the Experience section and the Toolbox section:

```jsx
      <section>
        <h2>Education</h2>
        <div className="timeline">
          {education.map((entry) => (
            <div className="timeline-entry" key={entry.credential}>
              <div className="timeline-role">{entry.credential}</div>
              <div className="timeline-company">{entry.school}</div>
              <div className="timeline-meta">{entry.meta}</div>
            </div>
          ))}
        </div>
        <ul className="chip-list">
          {certifications.map((certification) => (
            <li key={certification}>{certification}</li>
          ))}
        </ul>
      </section>
```

Also extend the component's doc comment to mention the education section, so the file's header stays an accurate description of what it renders.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/About.test.jsx`
Expected: PASS, 4 tests

- [ ] **Step 6: Format, lint, and run the whole suite**

```bash
cd frontend && npx prettier --write src/content/education.js src/pages/About.jsx src/pages/About.test.jsx && npx eslint src/content/education.js src/pages/About.jsx src/pages/About.test.jsx && npm test
```
Expected: no lint output, all suites pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/content/education.js frontend/src/pages/About.jsx frontend/src/pages/About.test.jsx
git commit -m "feat: add education and certifications to the About page"
```

---

### Task 3: Refresh the profile module

**Files:**
- Modify: `frontend/src/content/profile.js`

**Interfaces:**
- Consumes: nothing
- Produces: updated `profile.tagline`, `profile.bio`, `profile.toolbox`; consumed by `About.jsx`, `RootLayout.jsx` (tagline and footer), and `About.test.jsx`

- [ ] **Step 1: Replace the tagline, bio, and toolbox**

In `frontend/src/content/profile.js`, keep `name`, `email`, `github`, and `linkedin` exactly as they are. Replace the other three values:

```js
  tagline: 'Senior software engineer · Denver, Colorado',
  bio: `I'm a senior software engineer at Guild, where I've spent five years building and owning the backend payments and benefits systems that fund, track, and reconcile every learner benefit dollar — spend-writing APIs, funding context, tax classification, and the eligibility migration underneath them.

Before the code, eight years as a product manager across enterprise SaaS, payments, and video. I still work like one: architecture doc, then squad alignment, then the endpoint — and the data forensics when something goes wrong. Most useful on systems where correctness and money are the same problem.`,
```

```js
  /** Rendered as the About page's chip row, in this order. */
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
    'Event-driven integration',
    'GitHub Actions CI',
    'Distributed systems',
  ],
```

- [ ] **Step 2: Run the tests**

Run: `cd frontend && npm test`
Expected: PASS. `About.test.jsx` reads the module, so it asserts the new chips and the new bio paragraphs without any edit to the test file. A failure here means the bio's blank-line separation broke.

- [ ] **Step 3: Format and lint**

```bash
cd frontend && npx prettier --write src/content/profile.js && npx eslint src/content/profile.js
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/content/profile.js
git commit -m "content: update bio, tagline, and toolbox from the 2026 resume"
```

---

### Task 4: Refresh the experience module

**Files:**
- Modify: `frontend/src/content/experience.js`

**Interfaces:**
- Consumes: nothing
- Produces: updated `experience` array; consumed by `About.jsx` and `About.test.jsx`

- [ ] **Step 1: Replace the entries**

In `frontend/src/content/experience.js`, keep the file's doc comment and typedef as they are. Replace the array:

```js
export const experience = [
  {
    role: 'Software Engineer I → Sr. Software Engineer',
    company: 'Guild (formerly Guild Education)',
    meta: '2021 – present · Denver, CO',
    summary:
      'Spend-writing APIs, funding context, tax classification, and the eligibility migration underneath them — owned from API contract through rollout and incident forensics.',
    current: true,
  },
  {
    role: 'Product Manager, Payment Products',
    company: 'Guild (formerly Guild Education)',
    meta: '2020 – 2021 · Denver, CO',
    summary:
      'Balance tracking and external benefits administration for Fortune 1000 employer partners.',
  },
  {
    role: 'Software Product Manager, Core Services',
    company: 'MJ Freeway',
    meta: '2018 – 2019 · Denver, CO',
    summary:
      'Product owner for the core suite — cultivation, processing, and point of sale — on a two-to-three-week release cadence.',
  },
  {
    role: 'Manager, Video Products',
    company: 'Charter Communications',
    meta: '2014 – 2018 · Denver, CO',
    summary:
      'Roadmap and backlog for three set-top video guide products and their cross-platform features, including accessibility compliance.',
  },
  {
    role: 'Associate Product Manager, IPTV Platform',
    company: 'iBAHN',
    meta: '2012 – 2014 · Denver, CO',
    summary:
      'In-room hospitality video platform for Marriott, Hilton, and Four Seasons properties.',
  },
]
```

Note: the two Guild entries now share a `company` string, which is why `About.test.jsx` asserts companies with `getAllByText` rather than `getByText`. The React `key` in `About.jsx` is `company-role`, which stays unique.

- [ ] **Step 2: Run the tests**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 3: Format and lint**

```bash
cd frontend && npx prettier --write src/content/experience.js && npx eslint src/content/experience.js
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/content/experience.js
git commit -m "content: correct titles, dates, and employer name in work history"
```

---

### Task 5: Refresh the Home intro

**Files:**
- Modify: `frontend/src/pages/Home.jsx`

**Interfaces:**
- Consumes: nothing new
- Produces: no exports; visual copy change only

- [ ] **Step 1: Replace the intro paragraph**

In `frontend/src/pages/Home.jsx`, replace the `<p className="intro">` block with:

```jsx
      <p className="intro">
        I&rsquo;m a senior software engineer at Guild, building the payments and
        benefits systems behind employer education benefits. Eight years as a
        product manager first &mdash; so I care as much about <em>why</em> we
        build things as how.
      </p>
```

Leave the link cards untouched: `The PM-to-engineer story, plus the resume.` becomes accurate once Task 6 ships the PDF.

- [ ] **Step 2: Run the tests**

Run: `cd frontend && npm test`
Expected: PASS (no test covers Home; this confirms nothing else broke).

- [ ] **Step 3: Verify in the browser**

Start the dev server and load `/` and `/about`. Check both themes with the header toggle. Expected: new intro on Home; About shows bio, experience, education with certifications, and the toolbox chips wrapping cleanly. No console errors.

- [ ] **Step 4: Format, lint, and commit**

```bash
cd frontend && npx prettier --write src/pages/Home.jsx && npx eslint src/pages/Home.jsx
git add frontend/src/pages/Home.jsx
git commit -m "content: refresh the Home intro to match the new bio"
```

**ZONE 1 EXIT — batch review. Stop here and wait for Joey.**

---

### Task 6: Publish the resume PDF and link it from About

**Files:**
- Create: `frontend/public/resume.pdf`
- Modify: `frontend/src/pages/About.jsx`
- Modify: `frontend/src/pages/About.test.jsx`

**Interfaces:**
- Consumes: `education`, `experience`, `profile` as before
- Produces: a `/resume.pdf` asset in the build output and an anchor with `href="/resume.pdf"` and `download="Joey Haas Resume.pdf"`

- [ ] **Step 1: Write the failing test**

Append this case inside the `describe('About')` block in `frontend/src/pages/About.test.jsx`:

```jsx
  it('offers the resume as a downloadable PDF', () => {
    render(<About />)
    const link = screen.getByRole('link', {
      name: /download the full resume/i,
    })
    expect(link).toHaveAttribute('href', '/resume.pdf')
    expect(link).toHaveAttribute('download', 'Joey Haas Resume.pdf')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/About.test.jsx`
Expected: FAIL — `Unable to find an accessible element with the role "link"`

- [ ] **Step 3: Copy the PDF into the public directory**

```bash
mkdir -p frontend/public
cp "$HOME/Downloads/Joseph Haas Resume (web).pdf" frontend/public/resume.pdf
```

This is the phone-free export Joey produced. Do not substitute the file in `~/Documents/resume/`, which carries a phone number.

- [ ] **Step 4: Verify the file has no phone number before it enters git**

```bash
cd /private/tmp/claude-501/-Users-joey-haas-Developer-joey-haas-dev/48e32995-448c-49d6-bda9-d11af1181f40/scratchpad
npm install --no-save --silent pdf-parse@1
node -e "const fs=require('fs'),pdf=require('pdf-parse');pdf(fs.readFileSync(process.argv[1])).then(d=>{const hit=d.text.match(/[0-9]{3}[.\-][0-9]{3}[.\-][0-9]{4}|\([0-9]{3}\)/);console.log(hit?'PHONE FOUND: '+hit[0]:'clean, pages='+d.numpages)})" \
  "$HOME/Developer/joey-haas.dev/frontend/public/resume.pdf"
```
Expected: `clean, pages=2`. Anything else: stop, do not commit, report to Joey.

- [ ] **Step 5: Add the link to About**

In `frontend/src/pages/About.jsx`, directly beneath the Experience `<h2>`:

```jsx
        <h2>Experience</h2>
        <p className="prose">
          <a href="/resume.pdf" download="Joey Haas Resume.pdf">
            Download the full resume (PDF)
          </a>
        </p>
```

`.prose` is reused rather than a new class: it supplies the same top margin and body color the surrounding copy uses, so no CSS is added. The `download` attribute is honored because the file is same-origin, giving a readable filename while `/resume.pdf` stays short enough to paste into an email.

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/About.test.jsx`
Expected: PASS, 5 tests

- [ ] **Step 7: Verify the build carries the asset**

```bash
cd frontend && npm run build && ls -la dist/resume.pdf
```
Expected: build succeeds; `dist/resume.pdf` exists at roughly 61 KB, unhashed.

- [ ] **Step 8: Format, lint, and commit**

```bash
cd frontend && npx prettier --write src/pages/About.jsx src/pages/About.test.jsx && npx eslint src/pages/About.jsx src/pages/About.test.jsx && npm test
git add frontend/public/resume.pdf frontend/src/pages/About.jsx frontend/src/pages/About.test.jsx
git commit -m "feat: publish the resume PDF and link it from About"
```

---

### Task 7: Add a resume check to the smoke script

**Files:**
- Modify: `scripts/smoke.sh`

**Interfaces:**
- Consumes: the deployed `/resume.pdf`
- Produces: one additional smoke check

- [ ] **Step 1: Add the check**

In `scripts/smoke.sh`, insert this immediately after the `feed.xml is a well-formed channel` block and before the `GET /api/health` check:

```bash
# Like feed.xml, resume.pdf is a real file in dist/ rather than a route, so the
# content type is what distinguishes a served file from the SPA fallback: the
# rewrite would return index.html with a 200 if the asset were missing.
resume_type="$(curl -s -o /dev/null -m 90 -w '%{content_type}' "$SITE_URL/resume.pdf")"
case "$resume_type" in
  *pdf*) report_pass "resume.pdf served as PDF" "$resume_type" ;;
  *) report_fail "resume.pdf served as PDF" "got '$resume_type' — likely the SPA fallback" ;;
esac
```

- [ ] **Step 2: Verify the script still parses**

Run: `bash -n scripts/smoke.sh`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke.sh
git commit -m "test: smoke check that /resume.pdf serves a real PDF"
```

Note: the check cannot pass until Joey deploys, because it queries the production URL. It runs for real in the verification flow after merge.

---

### Task 8: Update the documentation

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing
- Produces: nothing

- [ ] **Step 1: Document the content module in README**

In `README.md`, in the list under "Content lives in `frontend/src/content/`" (around line 61), add an entry after the `profile.js` line:

```markdown
- `education.js` — degrees, bootcamp, and certifications
```

Then, immediately after that list, add:

```markdown
The resume PDF is not content in this sense — it is a static asset at
`frontend/public/resume.pdf`, which Vite copies unhashed to `dist/` and Render
serves at `/resume.pdf`. It is the phone-free export. Replace the file at that
exact path when the resume changes; renaming it breaks every link already sent
out.
```

- [ ] **Step 2: Add the convention to CLAUDE.md**

In `CLAUDE.md`, under "Conventions", add:

```markdown
- The resume PDF lives at `frontend/public/resume.pdf` and is served unhashed at
  `/resume.pdf`. The filename is load-bearing — it is the URL pasted into job
  applications — so replace the file in place rather than renaming it. Publish
  only the phone-free export; the copies in `~/Documents/resume/` carry a phone
  number.
```

- [ ] **Step 3: Format and commit**

```bash
npx prettier --write README.md CLAUDE.md
git add README.md CLAUDE.md
git commit -m "docs: document the education module and the published resume asset"
```

**ZONE 2 EXIT — batch review, then the finish gate.**

---

## Finish gate

1. `cd frontend && npm test` — green.
2. `cd frontend && npm run build` — succeeds, `dist/resume.pdf` present.
3. `cd frontend && npx eslint . && npx prettier --check .` — clean.
4. `bash -n scripts/smoke.sh` — clean.
5. Risk-scaled review of `git diff main...resume-refresh-2026`: 10 files touched including a published asset, so ultra review.
6. Draft the PR description; write the zone-exit notification; stop for Joey to push.

## Post-deploy verification

Joey merges and Render deploys both services. Then:

```bash
./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev
```

Expected: every check passes, including the new `resume.pdf served as PDF` line. Then load `https://joey-haas.dev/resume.pdf` directly to confirm the browser renders the two-page document rather than the SPA shell, and `/about` to confirm the download link saves the file as `Joey Haas Resume.pdf`.
