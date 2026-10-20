import { profile } from './profile.js'
import { LOAD_ERROR, WAKING } from './status.js'

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
    year: { to: '/spine/year', label: 'Year in review' },
  },
  next: {
    path: '/spine/next',
    title: 'What’s next',
    lede: 'What I could play tonight from my shelf, and what I am looking for in a store. Full cartridges only, ranked by what I have liked, rebuilt nightly.',
    fresh: {
      picks: 'Picks from',
      catalogue: 'release list checked',
      discover: 'suggestions from',
    },
    sections: {
      tonight: 'Tonight',
      wanted: 'On my list',
      buy_now: 'In stores now',
      preorders: 'Coming soon',
      later: 'Further out',
      not_on_cartridge: 'Not on cartridge',
    },
    empty: {
      upNext: 'Nothing lined up for tonight.',
      picks: 'No picks yet. They are rebuilt every night.',
      wanted: 'The list is empty, for now.',
      buy_now: 'Nothing worth buying today.',
      preorders: 'No cartridges due in the next 90 days.',
      later: 'Nothing announced further out.',
      not_on_cartridge: 'Nothing to skip.',
    },
    notOnCartridge: 'Digital only, or a Game-Key Card in a box. I skip these.',
    upNext: 'Up next',
    badges: { new: 'New', topPick: 'Top pick' },
    sorts: [
      { value: 'best', label: 'Best fit' },
      { value: 'newest', label: 'Newest' },
    ],
    sortLabel: 'Sort what is in stores now',
    outOn: 'Out',
    /** As a meta line starts; mirrors FORMAT_WORDS in physical_sources/limits.py. */
    formats: {
      game_card: 'Full game on cartridge',
      game_key_card: 'Game-Key Card',
      code_in_box: 'Code in a box',
      disc: 'Disc',
    },
    digitalOnly: 'Digital only',
    formatUnknown: 'Format unknown',
    otherPlatform: 'Other',
    attribution: { before: 'Game data from', label: 'IGDB', after: '.' },
    band: {
      lead: 'What’s next',
      tonight: 'Tonight:',
      toBuy: 'in stores',
      preorders: 'coming soon',
    },
    loading: 'Loading…',
    waking: WAKING,
    error: LOAD_ERROR,
  },
  /** /admin/store-list: What's next's sections with my answers on them. */
  storeList: {
    title: 'Store list',
    signIn: 'to see the store list.',
    note: 'On a Switch 2 box, look for the Game-Key Card label and put those back.',
    loading: 'Loading the list…',
    empty: {
      before: 'Nothing to look for yet. Generate',
      and: 'and',
      after: 'first.',
    },
    answers: {
      own: 'Got it',
      want: 'Want',
      dismiss: 'Not interested',
    },
    answered: {
      own: (title) => `Added ${title} to the collection`,
      want: (title) => `Added ${title} to my list`,
      dismiss: (title) => `Dropped ${title}`,
    },
  },
}
