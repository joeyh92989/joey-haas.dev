/**
 * Projects rendered on /projects.
 *
 * Static by design: this content does not change often enough to justify a
 * network round trip on every page load, and keeping it in the bundle means
 * the public site works even when the API is asleep or down.
 *
 * `url` is null when there is no publicly reachable link. `to` is an internal
 * route, used when the project lives on this site rather than elsewhere.
 */
export const projects = [
  {
    name: 'Media Collection',
    description:
      'A tracker for physical media — films, games, comics and board games. Backfilled by photographing the shelves: a vision model reads the titles and the backend resolves each against TMDB, IGDB or Comic Vine.',
    tech: ['React', 'FastAPI', 'Postgres', 'Gemini', 'TMDB'],
    to: '/collection',
    url: null,
  },
  {
    name: 'This Website',
    description:
      'Personal site with a React and Vite frontend and a FastAPI backend, deployed on Render.',
    tech: ['React', 'Vite', 'FastAPI', 'Render'],
    url: 'https://github.com/joeyh92989/joey-haas.dev',
  },
]
