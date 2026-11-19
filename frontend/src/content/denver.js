/**
 * Denver spots' copy: the tag labels and the admin page's words.
 *
 * The tag vocabulary itself is `TAGS` in `backend/spots.py`, which every
 * write is checked against; `denver.test.js` reads that file and holds the
 * keys here equal to it, in the same order.
 *
 * Spec and plan: docs/planning/2026-11-08-denver-spots-design.md.
 */

import { SESSION_ENDED } from './status.js'

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
    lede: 'Places I keep sending people to. Coffee, parks, somewhere dry for a kid on a snow day, and the ones you can ride to. Downtown and the near north side. Nothing here is sponsored.',
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
    sorted: 'sorted by neighborhood',
    offMap: 'Off the map',
    noMatch: 'No spot has all of those tags.',
    empty: 'Nothing here yet.',
    emptyLine: 'No spots are published.',
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
    sessionEnded: SESSION_ENDED,
    panelTitle: 'All spots',
    newMark: 'New',
    savedNotRefreshed: 'Saved, but the table couldn’t be refreshed.',
    refreshRetry: 'Try again',
    cityFilter: 'City',
    allCities: 'All cities',
    cityOption: (label, count) => `${label} (${count})`,
    stateFilter: 'Show',
    allPlaces: 'All places',
    stateOption: (label, count) => `${label} (${count})`,
    want: 'Want',
    been: 'Been',
    beenOn: (date) => `Been, ${date}`,
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
  weekend: {
    title: 'This weekend',
    reroll: 'Reroll',
    refresh: 'Refresh forecast',
    refreshing: 'Refreshing…',
    readError: 'The weekend plan couldn’t be read.',
    noForecast: 'No forecast yet. It refreshes every night.',
    forecastFailed: 'The last forecast refresh failed',
    forecastAt: 'Forecast from',
    suggestions: 'Suggestions',
    noSuggestions:
      'Nothing to suggest. Add spots, or loosen the constraints below.',
    save: 'Save',
    unsave: 'Unsave',
    savedFor: 'Saved for',
    been: 'Been',
    visited: 'Visited',
    skip: 'Skip',
    skipped: 'skipped for this weekend.',
    undo: 'Undo',
    skipsTitle: 'Skipped this weekend:',
    unskip: 'Unskip',
    constraintsTitle: 'Constraints',
    edit: 'Edit',
    kidAlong: 'Kid along',
    bikeIfDry: 'Bike if dry',
    within: 'Within',
    homeBy: 'Home by',
    noConstraints: 'No constraints set.',
    saveConstraints: 'Save constraints',
    cancel: 'Cancel',
    anyDistance: 'Any distance (miles)',
    anyTime: 'No limit',
    visitsTitle: 'Recent visits',
    noVisits: 'No visits logged yet.',
  },
  // The Did you go? block on the weekend page (story #349), from the mockup
  // docs/planning/2026-11-19-did-you-go/a-cards.html.
  didYouGo: {
    title: 'Did you go?',
    count: (n) => `${n} to answer`,
    notNow: 'Not now',
    been: 'Been',
    didnt: 'Didn’t',
    didntFor: 'go',
    howWas: 'How was it?',
    hint: 'Picking one logs the outing.',
    saving: 'Saving…',
    verdictFor: (name) => `Verdict for ${name}`,
    extras: 'Add a note or who came',
    noteLabel: 'Note (optional, one line)',
    kidLabel: 'Kid',
    came: 'Came along',
    stayed: 'Stayed home',
    failedTitle: 'Not saved',
    // Per outcome: a real refusal wrote nothing; no response says only to
    // check the connection; only a deadline timeout is "may or may not".
    refused: 'That didn’t go through. Nothing was written.',
    refusedWith: (message) =>
      `${/[.!?]$/.test(message) ? message : `${message}.`} Nothing was written.`,
    signedOut: `${SESSION_ENDED} Nothing was written.`,
    offline: 'That didn’t go through. Check your connection.',
    // No answer from the server: the write may or may not have landed.
    maybeLogged: (name) =>
      `The server did not answer, so the outing at ${name} may or may not have been saved. The plan is being read again: if this row is still here, check History before you try again.`,
    maybeDidnt: (name) =>
      `The server did not answer, so ${name} may or may not have been marked as not gone. The plan is being read again: if this row is still here, you can try again.`,
    logged: (verdict, name) => `Logged: ${verdict} at ${name}`,
    notGone: (name) => `Marked as not gone: ${name}`,
    hidden: 'Hidden for now. It asks again on your next visit.',
  },
  form: {
    addTitle: 'Add a spot',
    editTitle: 'Edit spot',
    coordsHint:
      'Required. Paste “latitude, longitude” or a maps link, e.g. 39.75, -104.99',
    anchorHint: 'Measure candidates’ distance from here',
    publicHint: 'Show on the public map',
    city: 'City',
    cityHint: 'Pick one you have used or type a new one.',
    cityRequired: 'A city is required.',
  },
}
