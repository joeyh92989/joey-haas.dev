import { profile } from './profile.js'
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
 * `strip: 'favourites'` shows the collection's favourite covers. `tagline`,
 * `highlights` and `links` are optional; `links` entries take `to` for a route
 * or `href` for an external URL, and carry no arrow.
 */
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
    tech: [
      'React',
      'FastAPI',
      'Postgres',
      'Gemini',
      'IGDB',
      'TMDB',
      'GitHub Actions',
    ],
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
