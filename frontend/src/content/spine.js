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
  tabs: {
    shelf: { to: '/spine', label: 'Shelf' },
    next: { to: '/spine/next', label: 'What’s next' },
  },
  next: {
    path: '/spine/next',
    title: 'What’s next',
    lede: 'What to play tonight from the shelf, and what to look for in a store: full cartridges only, ranked by the same taste profile, refreshed nightly.',
    fresh: {
      picks: 'Picks from',
      catalogue: 'catalogue refreshed',
      discover: 'Discover batch',
    },
    sections: {
      tonight: 'Tonight',
      wanted: 'Wanted',
      buy_now: 'Buy now',
      preorders: 'Pre-orders',
      later: 'Later',
      not_on_cartridge: 'Not on cartridge',
    },
    empty: {
      upNext: 'Nothing pinned tonight.',
      picks: 'No picks yet: Play Next runs every night.',
      wanted: 'Nothing on the want list.',
      buy_now: 'Nothing to buy right now.',
      preorders: 'No cartridges due in the next 90 days.',
      later: 'Nothing further out yet.',
      not_on_cartridge: 'Nothing to skip.',
    },
    notOnCartridge: 'Digital only or a Game-Key Card, so not for the shelf.',
    upNext: 'Up next',
    badges: { new: 'New', topPick: 'Top pick' },
    sorts: [
      { value: 'best', label: 'Best match' },
      { value: 'newest', label: 'Newest' },
    ],
    outOn: 'Out',
    band: {
      lead: 'What’s next',
      tonight: 'Tonight:',
      toBuy: 'to buy',
      preorders: 'pre-orders',
    },
    loading: 'Loading…',
    waking:
      'Waking the server — it sleeps when idle, so this takes about thirty seconds.',
    error: 'What’s next could not be loaded. Try again shortly.',
  },
}
