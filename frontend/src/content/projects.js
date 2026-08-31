/**
 * Projects rendered on /projects.
 *
 * Static by design: this content does not change often enough to justify a
 * network round trip on every page load, and keeping it in the bundle means
 * the public site works even when the API is asleep or down.
 *
 * `url` is null when there is no publicly reachable link. The repository for
 * this site is private, so linking it would send visitors to a 404.
 */
export const projects = [
  {
    name: 'This Website',
    description:
      'Personal site with a React and Vite frontend and a FastAPI backend, deployed on Render.',
    tech: ['React', 'Vite', 'FastAPI', 'Render'],
    url: null,
  },
]
