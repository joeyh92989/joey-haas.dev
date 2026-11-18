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
  onYourList: 'On your list',
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
    `${message} Nothing was written: the outing at ${name} was not logged${isNew ? ` and ${name} was not added to Spots` : ''}. What you entered is still here.`,
  saved: (name, created) =>
    created
      ? `Logged an outing at ${name} and added it to Spots as a private spot.`
      : `Logged an outing at ${name}.`,
}
