/**
 * Denver spots' copy: the tag labels and the admin page's words.
 *
 * The tag vocabulary itself is `TAGS` in `backend/spots.py`, which every
 * write is checked against; `denver.test.js` reads that file and holds the
 * keys here equal to it, in the same order.
 *
 * Spec and plan: docs/planning/2026-11-08-denver-spots-design.md.
 */

/** Each tag's label, in the backend's vocabulary order. */
export const TAG_LABELS = {
  coffee: 'Coffee',
  park: 'Park',
  food: 'Food',
  'kid-ok': 'Kid-OK',
  'rainy-day': 'Rainy day',
  'bike-friendly': 'Bike-friendly',
}

/** The tag keys, in order. */
export const TAGS = Object.keys(TAG_LABELS)

/** A tag's label, or the key itself for one this build does not know. */
export function tagLabel(tag) {
  return TAG_LABELS[tag] ?? tag
}

export const denver = {
  page: {
    path: '/denver',
    title: 'Denver, the short list',
    lede: 'Places I keep sending people to. Coffee, parks, somewhere dry for a kid on a snow day, and the ones you can ride to. Downtown and the near north side; no reservations, no sponsorships.',
    description:
      'Places in downtown Denver and the near north side that Joey Haas keeps sending people to: coffee, parks, somewhere dry for a kid on a snow day, and the ones you can ride to.',
    mapLabel: (count) =>
      `Map of downtown Denver with ${count} pinned ${count === 1 ? 'spot' : 'spots'}`,
    mapTitle: 'Downtown Denver',
    tagsLabel: 'Filter by tag',
    all: 'All',
    viewLabel: 'View',
    views: { list: 'List', map: 'Map' },
    count: (count) => `${count} ${count === 1 ? 'spot' : 'spots'}`,
    sorted: 'sorted by neighbourhood',
    offMap: 'Off the map',
    noMatch: 'No spot has all of those tags.',
    empty: 'No spots yet.',
  },
  admin: {
    title: 'Spots',
    description:
      'Places worth going back to. Anchors are where distances are measured from.',
    add: 'Add by hand',
    search: 'Search spots',
    empty: 'No spots yet. Add one by hand.',
    noMatch: 'No spot matches that search.',
    readError: 'The spots couldn’t be read.',
    sessionEnded: 'Your session ended. Reload to sign in.',
    panelTitle: 'All spots',
  },
  finder: {
    title: 'Spot finder',
    runNow: 'Run now',
    running: 'Running…',
    never: 'Not run yet. It runs Sunday evenings.',
    empty: 'Nothing new this week. Next run Sunday.',
    readError: 'The finder’s queue couldn’t be read.',
    accept: 'Accept into spots',
    dismiss: 'Dismiss',
    undo: 'Undo',
    accepted: 'added to your spots.',
    dismissed: 'dismissed for good.',
    notScored: 'Not scored: the model didn’t answer this run.',
    tagsLabel: 'Tags to keep',
    source: 'OSM',
    sourceName: 'From OpenStreetMap',
  },
  form: {
    addTitle: 'Add a spot',
    editTitle: 'Edit spot',
    coordsHint:
      'Paste “latitude, longitude” or a maps link, e.g. 39.75, -104.99',
    anchorHint: 'Measure candidates’ distance from here',
    publicHint: 'Show on the public map',
  },
}
