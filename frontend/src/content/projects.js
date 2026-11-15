import { profile } from './profile.js'
import { intake } from './intake.js'
import { spine } from './spine.js'

/**
 * Projects rendered on /projects.
 *
 * Static by design: this content does not change often enough to justify a
 * network round trip on every page load, and keeping it in the bundle means
 * the public site works even when the API is asleep or down.
 *
 * `url` is null when there is no publicly reachable link. `to` is an internal
 * route, used when the project lives on this site rather than elsewhere.
 * `strip: 'favourites'` shows the collection's favorite covers. `summary` is
 * Home's one-line version of a card; `line` sits above the tech chips. `tagline`,
 * `highlights` and `links` are optional; `links` entries take `to` for a route
 * or `href` for an external URL, and carry no arrow. `hero` is the card's
 * picture: `slug` names `public/projects/<slug>-dark.webp` and `-light.webp`
 * (made by `scripts/project-heroes.mjs`), with `alt`, `width` and `height`.
 * `differently` is Joey's "what I'd do differently" line, left unset until he
 * writes it; the card shows it only when it is set.
 */
export const projects = [
  {
    name: spine.name,
    tagline: spine.projectsTagline,
    line: spine.projectLine,
    description:
      'I collect games on cartridge, and nothing tracked them the way I wanted, least of all whether a box holds the full game or a download code. My Shelf does. It reads a shelf from a photograph, resolves every title against IGDB, picks tonight’s game from the backlog, and watches boutique publishers for the next cartridge worth owning.',
    highlights: [
      'Photo import: a vision model reads titles off the spines; each match is scored by string distance, never by asking the model how sure it is.',
      'A physical catalog: a community registry and a watch list of boutique stores, collapsed to one honest format per game, full cartridge or Game-Key Card.',
      'Play next scores the backlog on six weighted terms, mostly a taste profile built from my own ratings, favorites, and finishes, plus fit and time waiting. Every pick says why.',
      'Discover and Radar: the model only ever picks positions in a list the server built, with a deterministic fallback when it can’t answer.',
    ],
    links: [
      { to: spine.path, label: `Open ${spine.name}` },
      spine.links.post,
      { to: intake.path, label: intake.title },
      spine.links.source,
    ],
    tech: ['React', 'FastAPI', 'Postgres', 'Gemini', 'IGDB', 'GitHub Actions'],
    to: spine.path,
    url: null,
    strip: 'favourites',
    hero: {
      slug: 'my-shelf',
      alt: 'My Shelf’s Games page: three figures (108 owned, 58 finished, 8 finished this year), the game I’m playing now, and filter chips for status, play style and setting.',
      width: 1200,
      height: 560,
    },
    // differently: '',  // Joey's line: what I'd do differently
  },
  {
    name: 'This site',
    summary:
      'React and Vite, FastAPI behind Google sign-in, Postgres on Neon, and a pull-request pipeline to Render.',
    description:
      'A React and Vite frontend with a Markdown blog compiled at build time, a FastAPI backend behind Google sign-in, Postgres on Neon, and a pull-request pipeline that deploys to Render on merge. Built to be read, including by the recruiter who clicks View source.',
    links: [
      { href: profile.repo, label: 'Source' },
      { href: `${profile.repo}/actions`, label: 'CI pipeline' },
    ],
    tech: ['React', 'Vite', 'FastAPI', 'Postgres', 'GitHub Actions', 'Render'],
    url: profile.repo,
    hero: {
      slug: 'this-site',
      alt: 'The home page of this site: the headline, a short introduction, and a panel with my role, focus, stack, last ship date and the game I’m playing.',
      width: 1200,
      height: 560,
    },
    // differently: '',  // Joey's line: what I'd do differently
  },
]
