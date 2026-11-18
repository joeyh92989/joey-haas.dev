/**
 * The words of /admin/places/add (owner-only). They follow the mockup
 * docs/planning/mockups/2026-11-17-places-add/c-inline.html; the one line
 * it does not draw is `publicOnlyDenver`.
 */
export const placesAdd = {
  title: 'Add a place',
  description: 'search by name, then add it from the list',
  searchLabel: 'Search for a place',
  nameLabel: 'Place name',
  searchHint:
    'Nothing is looked up while you type. Press Search or Enter when the name is ready.',
  search: 'Search',
  searching: 'Searching…',
  failed: (q) =>
    `The OpenStreetMap search did not answer. Nothing was saved, and “${q}” is still in the box.`,
  tryAgain: 'Try again',
  typeByHand: 'Type it by hand',
  noneHelp:
    'Check the spelling or add the city, then search again. A place that is not on OpenStreetMap can be typed in by hand.',
  changeWords: 'Change the words',
  otherWays: 'Other ways in:',
  otherWaysLabel: 'Other ways in',
  resultsFor: (q) => `Results for “${q}”`,
  detailsFor: (title) => `Details for ${title}`,
  savedHeading: (name) => `Saved ${name}`,
  addLabel: (title, address) => `Add ${title}${address ? `, ${address}` : ''}`,
  mapFor: (title) => `: ${title}`,
  alreadySavedFor: (title) => `: ${title}, open on Spots`,
  noneOfThese: 'None of these?',
  noneOfTheseLabel: 'None of these',
  typeHeading: 'Type a place by hand',
  coordsHint: 'Paste “latitude, longitude” or a maps link, e.g. 39.75, -104.99',
  osmCredit: 'Search by OpenStreetMap contributors',
  osmCopyright: 'https://www.openstreetmap.org/copyright',
  viewOnMap: 'View on OpenStreetMap',
  add: 'Add',
  alreadySaved: 'Already saved',
  savePlace: 'Save place',
  cancel: 'Cancel',
  searchAgain: 'Search again',
  city: 'City',
  cityHint: 'The city list this place goes on. The address stays as found.',
  anotherCity: 'Another city…',
  cityName: 'City name',
  tags: 'Tags',
  blurb: 'Blurb',
  blurbHint: 'One line, optional.',
  isPublic: 'Show on the public Denver page',
  publicOff: 'Off, so only you can see this place.',
  // Not drawn in the mockup: decision 15 (public only for a Denver place).
  publicOnlyDenver: 'Only a Denver place can be shown on the public page.',
  name: 'Name',
  coords: 'Coordinates',
  addAnother: 'Add another',
  viewOnSpots: 'View on Spots',
  doneNote: 'It is a private spot. Only you can see it.',
  doneNotePublic: 'It is on the public Denver page.',
  addedHeading: 'Added this visit',
  savedPrivate: 'Saved, private',
  savedPublic: 'Saved, public',
  // The server's own words for a place already on the list, said when a
  // commit finds it owned.
  alreadyOnList: 'That place is already on your list',
  noAnswer: 'The server did not answer; try again.',
  status: {
    searching: (q) =>
      `Searching OpenStreetMap for “${q}”. This can take a few seconds.`,
    one: (q) => `1 place found for “${q}”.`,
    several: (n, q) => `${n} places found for “${q}”. Pick the one you mean.`,
    saved: (n, q) =>
      n > 1
        ? `${n} places found for “${q}”. You already saved one of them.`
        : `1 place found for “${q}”. You already saved it.`,
    picked: (name) => `${name} picked.`,
    none: (q) => `No place found for “${q}”.`,
    done: (name) => `Saved ${name} as a private spot.`,
    donePublic: (name) => `Saved ${name} and put it on the public Denver page.`,
  },
}
