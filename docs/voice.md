# Voice for joey-haas.dev

Approved by Joey on 2026-11-12, with his edits. Every quote below is Joey's or copy he approved. Every copy draft for this site is written against this file. When Joey rewrites a line, his version is added here as a sample.

## 1. Who is speaking, and to whom

Joey: a senior software engineer in Denver, talking to visitors who are recruiters, engineers and friends. One person talking to another, in first person, saying what a thing is and does.

## 2. Samples

**Hero** (`frontend/src/content/profile.js`)
> Shipping software since 2012, from *roadmap to production.*

**Lede** (`frontend/src/content/profile.js`)
> I’m a senior software engineer at Guild, building the payments and ledger systems behind employer-funded education. I spent eight years as a product manager before that, so I care as much about why we build things as how.

**About bio** (`frontend/src/content/profile.js`)
> I still work like one: architecture doc first, then team alignment, then the endpoint, and the data forensics when something goes wrong.

**Shelf tagline** (`frontend/src/content/spine.js`)
> A tracker for my physical game and comic collection: what I own, what I’ve finished, and what to play or read next.

**Shelf explainer** (`frontend/src/content/spine.js`)
> the model answers with positions in a list I built, never with titles. A model that returns titles can invent one; a model that returns positions can’t.

**Empty and error lines** (`frontend/src/content/spine.js`, `frontend/src/content/status.js`)
> Nothing on my backlog fits that. Try another vibe.  *(Joey's rewrite, 2026-11-12: "vibe", not "mood")*
> That didn’t load. Try again in a minute.
> Couldn’t reach the server. Try again in a minute.

**Changelog** (`frontend/changelog.md`)
> Spine is now [My Shelf](/shelf); every old /spine link redirects.

**Blog** (`frontend/posts/how-spine-works.md`)
> Typing a few hundred titles into a form is the kind of job that gets abandoned at item forty, so the import path had to be a camera.

**TIL** (`frontend/notes/render-rewrites-need-the-slash.md`)
> A rewrite to a file the build did not write serves an empty 200, not the SPA.

**Colophon** (`frontend/src/pages/Colophon.jsx`)
> How this site is built, for anyone curious. The whole thing is open:

## 3. Do / don't

| Do (real line) | Don't (version to avoid) |
|---|---|
| "That didn’t load. Try again in a minute." | "Oops! Something went wrong while loading. Please try again later." |
| "Nothing on the shelf yet." | "Your shelf is looking a little empty right now!" |
| "I’m a senior software engineer at Guild, building the payments and ledger systems behind employer-funded education." | "I’m a passionate engineer who thrives at the intersection of payments and education." |
| "I built this myself: React and FastAPI on free tiers, Postgres on Neon, and a camera pointed at the shelf." | "A robust, seamless full-stack experience powered by cutting-edge tech." |
| "Typing a few hundred titles into a form is the kind of job that gets abandoned at item forty, so the import path had to be a camera." | "Importing a collection by hand is not just tedious, it’s a dealbreaker." |
| "How this site is built, for anyone curious." | "Welcome to the colophon, where the magic happens!" |

## 4. Avoid on this site

- Reveals set up by a dash or colon, and "not just X, it’s Y" or "not only … but also".
- Three parallel items or adjectives used for rhythm.
- Quips, winks, jokes, and commentary on the text itself.
- Fragments for punch. Questions asked only to be answered.
- Announcers and cheerleaders: "Let’s dive in", "Here’s the thing", "excited to", "thrilled", "In short".
- Hype and résumé words: seamless, robust, leverage, elevate, unlock, cutting-edge, world-class, passionate about, game-changer, delve.
- Exclamation marks, "Oops", "Please", and apologies in errors. Say what happened and what to do next.
- Praise before description. Say what a thing is and does first.
- Self-praise adjectives in career copy. Use the figure, as the bio does: "roughly $1B a year for 3.37M learners".

## 5. House rules already in the code

- **American spelling.** `frontend/src/content/spine.js` header: "contractions (“I'm”, “what's”) and American spelling (favorites, catalog, normalized, colors). Only words a visitor reads move; routes such as /admin/catalogue … keep their spelling."
- **First person, contractions.** "I built this myself", "what’s next".
- **Sentence case** for headings and buttons: "Try again", "Year in review", "What it does".
- **Typographic apostrophes** (’) in UI strings: "Couldn’t reach the server. Try again in a minute."
- **One name per thing** (Joey, 2026-11-12, #201). Visitor-facing names; routes, code names and API keys keep theirs:
  - **Blog** (not Writing): nav, page title, Home's kicker.
  - **Daily game** (not Shelfle or Daily): tab, page title, footer, links, share text.
  - **Tour** (not How it works or guided tour): the tab and every link to `/shelf/how`.
  - **This site** (not joey-haas.dev) for the site as a project.
  - **Sources** (not catalog or catalogue) on the admin page at `/admin/catalogue`.
  - **vibe** (not mood) in Pick for me.
  - **My Shelf** for the tracker; **Games** and **Comics** are its list tabs and the admin pages that twin them (shelf split, 2026-11-13). Collection is retired as a visitor-facing name.
- **One wording per state.** Waking, load failure and action failure each live once in `frontend/src/content/status.js`; pages import them.
- **The site is warmer and more first-person than the résumé** (`docs/planning/2026-09-18-resume-copy-sync-design.md`). Do not flatten it to résumé tone.

## Known departures to resolve

- `frontend/src/content/status.js` has straight apostrophes in "Planning didn't answer in time." and "Tagging didn't answer in time."
- `frontend/src/content/status.js` `WAKING` uses a dash: "Waking the server — it sleeps when idle…"
- `frontend/notes/render-rewrites-need-the-slash.md` uses straight apostrophes in prose.
