### 1. Persona and goal
- Persona: technical recruiter / hiring manager, desktop wide window, ~90 seconds of patience, arrived from a job application link.
- Goal: learn who this is, what they built, whether they fit a senior SWE role, and how to contact them or get a resume.

### 2. Journey log
1. Home (/) - expected a name, a role, proof of work - saw a dark page: "Senior software engineer, Denver", H1 "Shipping software since 2012, from roadmap to production.", a short bio, buttons About me / Resume (PDF) / Email me / See My Shelf / GitHub, and a side card (Now: Guild Senior SWE, Stack, Last shipped, Playing) - read it - pleased (answered who/what/where in about 5 seconds).
2. Home, scroll - expected projects and experience - saw three Work cards (My Shelf, This site, a blog post) and a 3-row Experience list, with email and LinkedIn at the bottom - read - mostly pleased. Slight hesitation: "since 2012" in the H1 is product management, not engineering, and the Experience block shows only a one-liner per job.
3. /projects - expected several projects - saw only one project, My Shelf, with a big screenshot, a description, and Open / Tour / Try the intake / Source links - read - ok but thin. "All projects ->" leads to a single project, which feels like an overpromise. The page is about a personal game-collection tracker, not work-relevant.
4. /about - expected a resume-like summary - saw a profile photo, a fact table, and a detailed Guild timeline with real metrics (3.84M row backfill, 55-74% latency cut, $1B annual spend, 3.37M learners) - read for the fit question - pleased. This is the page that sells him. It is long, though, and I only found it by clicking About.
5. Resume link (nav "Resume down-arrow") - expected a download - it opened /resume.pdf inline in the browser, a 2-page clean resume - pleased. The PDF tab title reads "Joseph Haas Resume 2026(JTH Edits)", which looks like a draft filename.
6. /blog - expected posts - saw one post (Oct 2, 2026) plus RSS and a TIL link - ok. The page sits in a narrow column with a lot of empty space below.
7. Blog post - expected an engineering writeup - saw an 11 min read with a table of contents; the post is detailed and credible (confidence measured not asked of the model, additive migrations, tests that pin public fields). The URL slug is /blog/how-spine-works while the title says "My Shelf" - leftover name. Good depth for a senior hire, but it is about a hobby app.
8. /shelf (nav My Shelf) - expected a showcase - redirected to /shelf/games, saw stats (109 owned, 58 finished), Now Playing, filter chips and sub-tabs (Comics, What's next, Year in review, Tour, Daily game) - skimmed - mildly distracted. It is a personal game collection; not what I came for. The layout is wider than the other pages.
9. /now - expected a work "now" page - saw a games-only page ("covers games only. My work is on the About page") - found it a bit off, but the page tells me up front. Footer has many extra pages (Colophon, Stats, Daily game, TIL, Sign in).
Total time to get core answers (who, role, company, contact, resume): well under 90 seconds. I kept reading.

### 3. Findings
- **F1**, Severity: minor
  - Where: Home, H1 and hero
  - What happened: "Shipping software since 2012" reads as 14 years of engineering; the About page says 5 years engineering and 8 years product. A recruiter checking the resume will notice the gap. I expected the headline to match the resume.
  - Fix kind: copy
  - Suggestion: Say "Senior software engineer, 5 years building payments and ledger systems; 8 years in product before that" or similar. Keep the roadmap-to-production angle, since it is a real selling point.
  - Evidence: Home hero H1 vs About fact table (Engineering 5 years, Product 8 years).

- **F2**, Severity: major
  - Where: Home Work section and /projects
  - What happened: Both the "Work" cards and /projects centre on a hobby game tracker. There is no work-related project, no hint of the Guild systems (ledger, createSpend), and "All projects ->" leads to a single project. I expected a showcase of professional-grade work or at least architecture diagrams for the payments work.
  - Fix kind: structural refactor
  - Suggestion: Add a "Selected work at Guild" card or case study (sanitised) on Home and Projects, and put My Shelf second. If there is no second project, rename "All projects ->" to "Project details ->" or drop it.
  - Evidence: Projects page shows one project only.

- **F3**, Severity: major
  - Where: Home Experience section
  - What happened: The strongest evidence (metrics, 3.84M row backfill, 55-74% latency cut) is only on /about. Home's Experience shows a vague line per job ("Owned the APIs that record benefit spending"). On a 90-second skim I would not have seen the numbers unless I clicked About.
  - Fix kind: copy
  - Suggestion: Pull 2 or 3 headline metrics into the Home Experience entry for Guild (e.g. "$1B annual spend, 3.84M-row backfill, 55-74% latency cut") and link "More ->" to About.
  - Evidence: Home Experience block vs About timeline.

- **F4**, Severity: minor
  - Where: /blog/how-spine-works
  - What happened: The URL slug says "spine" while the site calls the product "My Shelf". Looks like a half-finished rename.
  - Fix kind: structural refactor
  - Suggestion: Rename the slug to how-my-shelf-works and add a redirect from the old one.
  - Evidence: Tab URL on the post page.

- **F5**, Severity: minor
  - Where: /resume.pdf
  - What happened: The PDF document title is "Joseph Haas Resume 2026(JTH Edits)", visible in the browser tab. It looks like a working draft. The nav label "Resume down-arrow" suggests download, but the file opens in the browser.
  - Fix kind: copy
  - Suggestion: Set the PDF metadata title to "Joseph Haas - Resume". Label the link "Resume (PDF)" consistently.
  - Evidence: Tab title on the PDF.

- **F6**, Severity: minor
  - Where: /shelf and /now
  - What happened: Game stats and the "Tonight" game differ between pages (Projects screenshot said 108 owned and Tonight Donkey Kong Bananza; the Shelf page said 109 and Hades II). The shelf and Now pages are games-only, which feels like a different site from the professional one. The Shelf page is wider than the rest.
  - Fix kind: layout
  - Suggestion: Regenerate the Projects screenshot or make it clearly a snapshot with a date. Match the content width across pages.
  - Evidence: Projects hero screenshot vs Shelf stat tiles.

- **F7**, Severity: nit
  - Where: Footer and Blog page
  - What happened: Footer carries Source, Now, Daily game, TIL, Colophon, Stats, RSS, Sign in. Several are of no use to a recruiter and "Sign in" is odd on a portfolio. The blog page has a large empty area below one post.
  - Fix kind: navigation
  - Suggestion: Group the footer into a short "Elsewhere" list; hide "Sign in" from public view; fine to leave the blog sparse but add a second post or drop "TIL" prominence.
  - Evidence: Blog page footer.

- **F8**, Severity: nit
  - Where: Home hero
  - What happened: Email is on the page as a button and as a text link at the bottom, but LinkedIn is only a small text link at the bottom of Home. A recruiter wants LinkedIn as prominent as GitHub.
  - Fix kind: layout
  - Suggestion: Add LinkedIn to the hero button row next to GitHub.
  - Evidence: Home hero buttons.

### 4. Could not do
- Nothing blocking. I could not tell from the site whether he is open to new roles or his location preference (remote vs Denver); there is no "availability" line. I did not test the mobile layout or the search (Cmd+K) in depth.

### 5. Worked well
- Instant clarity on the home page: role, city, employer, stack, and contact buttons above the fold.
- Resume is one click from every page (nav) and opens inline, 2 pages, clean.
- About page has quantified, credible senior-level impact and a clear timeline.
- The blog post shows real engineering judgement (tests that pin public fields, additive migrations, models never grading their own output).
- The product-to-engineering career story is a distinct strength, and the site says so plainly.
- Clean, readable dark theme, light/dark toggle, search, skip link.

### 6. Overall: would I come back or recommend it?
Yes, I would move him forward to a screen. Within a minute I knew he is a senior payments/ledger engineer at Guild with 5 years of engineering and a product background, and I had his resume and email. The About page carries real weight with numbers, and the blog post proves he can think and write at depth. What holds it back is that the "Work" showcase is a personal game-collection app, so nothing on the first screens shows his professional engineering, and the headline "since 2012" slightly overstates his engineering tenure. Moving the Guild metrics up front, adding a work case study, and tidying leftovers (the "spine" slug, the "JTH Edits" PDF title) would make it look more polished. As it stands it looks credible and organised, with a mild side of hobby content that is distracting only if you are in a hurry.
