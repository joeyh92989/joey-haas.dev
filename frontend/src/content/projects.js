/**
 * Projects rendered on /projects.
 *
 * Static by design: this content does not change often enough to justify a
 * network round trip on every page load, and keeping it in the bundle means
 * the public site works even when the API is asleep or down.
 *
 * `url` is null when there is no publicly reachable link. `to` is an internal
 * route, used when the project lives on this site rather than elsewhere.
 * `strip: 'favourites'` shows the collection's favourite covers; `more: { to, label }`
 * is a secondary internal link, added only once its target exists.
 */
export const projects = [
  {
    name: 'Media Collection',
    description:
      'A tracker for my physical game collection. The public shelf shows what I own, what I have finished, ratings and favourites; every item was backfilled by photographing the shelves and resolving the titles against IGDB, TMDB or Comic Vine. Signed in, it picks tonight’s game from the backlog, keeps a catalogue of what exists on cartridge from a community registry and a dozen boutique stores, and uses that to surface upcoming physical releases and games I would probably like but do not own.',
    tech: ['React', 'FastAPI', 'Postgres', 'Gemini', 'IGDB', 'TMDB'],
    to: '/collection',
    url: null,
    strip: 'favourites',
  },
  {
    name: 'This Website',
    description:
      'This site: a React and Vite frontend with a markdown blog compiled at build time, a FastAPI backend behind Google sign-in, Postgres on Neon, and a pull-request pipeline that deploys to Render on merge.',
    tech: ['React', 'Vite', 'FastAPI', 'Postgres', 'GitHub Actions', 'Render'],
    url: 'https://github.com/joeyh92989/joey-haas.dev',
  },
]
