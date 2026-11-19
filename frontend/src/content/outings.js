/**
 * The words of the Log an outing sheet (story #346). They follow the mockup
 * docs/planning/mockups/2026-11-18-log-outing/a-one-form.html. The search
 * states and the failed-search line are `placesAdd`'s own; this file holds
 * only what the sheet adds.
 */
export const outings = {
  open: 'Log an outing',
  title: 'Log an outing',
  placeLabel: 'Place',
  placeHint:
    'Saved spots show as you type. A place that is not saved is looked up only when you press Search.',
  search: 'Search',
  searching: 'Searching…',
  savedLoadFailed:
    'Your saved spots could not be read. Search still works for a place.',
  noSavedMatch: (q) =>
    `No saved spot matches “${q}”. Press Search to look it up.`,
  savedMark: 'Saved',
  change: 'Change',
  isNew: 'New',
  isPrivate: 'Private',
  newNote: (city) =>
    `Not on Spots yet. Save outing adds it as a private spot in ${city}, in the same save.`,
  cityLabel: 'City',
  cityHint: 'The city list this place goes on. The address stays as found.',
  otherCity: 'Another city…',
  cityName: 'City name',
  cityNameRequired: 'Type the city name.',
  dateLabel: 'Date',
  futureDate: 'That is more than a day ahead. Pick today or an earlier date.',
  verdictLabel: 'Verdict',
  verdicts: [
    ['loved', 'Loved'],
    ['fine', 'Fine'],
    ['not_again', 'Not again'],
  ],
  noteLabel: 'Note',
  noteOptional: '(optional, one line)',
  titleLabel: 'Title',
  titleOptional: '(optional)',
  titleHint: 'What it was, e.g. Rockies game.',
  kid: 'Kid came along',
  cancel: 'Cancel',
  save: 'Save outing',
  saving: 'Saving…',
  tryAgain: 'Try again',
  needPlace: 'Pick a place first.',
  needVerdict: 'Pick a verdict.',
  failedTitle: 'Not saved',
  failed: (message, name, isNew) =>
    `${/[.!?]$/.test(message) ? message : `${message}.`} Nothing was written: the outing at ${name} was not logged${isNew ? ` and ${name} was not added to Spots` : ''}. What you entered is still here.`,
  // No answer from the server: the save may or may not have landed.
  maybeSaved: (name, isNew) =>
    `The server did not answer, so the outing at ${name} may or may not have been saved${isNew ? ` and ${name} may or may not be on Spots now` : ''}. The list behind this sheet is being read again: check it before you try again. What you entered is still here.`,
  saved: (name, created) =>
    created
      ? `Logged an outing at ${name} and added it to Spots as a private spot.`
      : `Logged an outing at ${name}.`,
}

/**
 * The words of the History page (story #347), from the mockup
 * docs/planning/mockups/2026-11-18-history/a-dated-list.html.
 */
export const history = {
  title: 'History',
  description: 'Outings, newest first.',
  counts: (year, outings, places, loved) =>
    `${year} so far: ${outings} ${outings === 1 ? 'outing' : 'outings'}, ${places} ${places === 1 ? 'place' : 'places'}, ${loved} loved.`,
  groupCount: (n) => `${n} ${n === 1 ? 'outing' : 'outings'}`,
  someTimeInMonth: (month) => `Some time in ${month}`,
  someTimeInYear: (year) => `Some time in ${year}`,
  noVerdict: 'No verdict',
  kid: 'Kid came along',
  privateNote: 'Private note: ',
  emptyTitle: 'No outings logged yet.',
  emptyLine: 'Log one and it shows here, newest first.',
  readError: 'The history could not be read. Try again in a minute.',
  filtersLabel: 'Filters',
  // Filters and place links (story #348), from the mockup
  // docs/planning/mockups/2026-11-18-history-filters/b-filters-sheet.html.
  filtersOn: ' on',
  filtersClose: 'Close',
  filtersClear: 'Clear filters',
  filtersShow: (n) => `Show ${n} ${n === 1 ? 'outing' : 'outings'}`,
  filtersNone: 'No outings match',
  placeRow: 'Place',
  cityRow: 'City',
  tagRow: 'Tag',
  verdictRow: 'Verdict',
  kidRow: 'Kid',
  kidFilter: 'Came along',
  thisPlace: 'this place',
  chipPlace: (name) => `Place: ${name}`,
  chipCity: (name) => `City: ${name}`,
  chipTag: (name) => `Tag: ${name}`,
  chipVerdict: (word) => `Verdict: ${word}`,
  removeFilter: (name) => `Remove filter. ${name}`,
  result: (shown, total) =>
    `${shown} of ${total} ${total === 1 ? 'outing' : 'outings'}`,
  filteredCounts: (year, outings, places, loved) =>
    `${year}, filtered: ${outings} ${outings === 1 ? 'outing' : 'outings'}, ${places} ${places === 1 ? 'place' : 'places'}, ${loved} loved.`,
  noMatchTitle: 'No outings match these filters.',
  noMatchLine: (names) => `${names.join(', ')}.`,
  placeHistory: 'History',
  placeHistoryLabel: (name) => `History for ${name}`,
}
