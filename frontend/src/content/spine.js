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
