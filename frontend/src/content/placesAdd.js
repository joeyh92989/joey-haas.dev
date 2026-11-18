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
  // The Spots page's add bar (story #341), from the mockup
  // docs/planning/mockups/2026-11-17-spots-add-bar/a-panel-above.html.
  // Everything else it says is above: the status lines, "Saved ...", the
  // failure line and the fields.
  bar: {
    nameLabel: 'Add a place by name',
    hint: 'Nothing is looked up while you type. Press Search or Enter.',
    addByHand: 'Add by hand',
    showInTable: 'Show in table',
    showInTableFor: (title) => `: ${title}`,
    noneHelp:
      'Check the spelling or add the city, then search again. A place that is not on OpenStreetMap can be added by hand.',
  },
  // Paste a list (story #342), from the mockup
  // docs/planning/mockups/2026-11-18-places-paste/a-steps.html. The fields,
  // the OpenStreetMap credit and the refusals are above.
  paste: {
    way: 'Paste a list',
    heading: 'Paste a list',
    checking: 'Looking for a list you started…',
    boxLabel: 'Places, one per line',
    boxHint:
      'A name, or a full Google Maps or OpenStreetMap link. Up to 200 lines. Nothing is sent until you press Add lines.',
    addLines: 'Add lines',
    adding: 'Adding…',
    lineCount: (n) => (n === 1 ? '1 line' : `${n} lines`),
    over: (total) =>
      `${total} lines in the box. Only the first 200 will be added.`,
    zeroEmpty: 'Paste at least one line first.',
    zeroBlank: (n) =>
      `Nothing was added. ${n === 1 ? 'The line was' : `All ${n} lines were`} blank.`,
    tooBig: (max) =>
      `The box holds more than ${max} characters. Cut it down, or paste the list in parts.`,
    pasteRefused:
      'The server did not accept that text. Check the lines and try again.',
    zeroKnown: 'Nothing was added. Every line is already in the list.',
    pasteFailed:
      'The server did not answer; try again. Nothing was added, and your lines are still in the box.',
    // The summary after Add lines.
    added: (n) => (n === 1 ? '1 line added.' : `${n} lines added.`),
    ignored: (blank, duplicates) => {
      const parts = [
        blank && (blank === 1 ? '1 blank line' : `${blank} blank lines`),
        duplicates &&
          (duplicates === 1
            ? '1 duplicate line'
            : `${duplicates} duplicate lines`),
      ].filter(Boolean)
      return parts.length ? ` ${parts.join(' and ')} ignored.` : ''
    },
    overDropped: (n) =>
      ` ${n === 1 ? '1 line' : `${n} lines`} over the limit ${n === 1 ? 'was' : 'were'} dropped.`,
    inList: (n) =>
      n === 1 ? 'Your list has 1 line.' : `Your list has ${n} lines.`,
    showText: 'Show the pasted text',
    hideText: 'Hide the pasted text',
    pastedLabel: 'The pasted text',
    // Resume.
    resumeLead: (n) =>
      n === 1
        ? 'You started a list with 1 line and did not finish it.'
        : `You started a list with ${n} lines and did not finish it.`,
    resumeContinue: (n) =>
      n === 1
        ? 'Continue your list (1 line)'
        : `Continue your list (${n} lines)`,
    resumeNew: 'Start a new list',
    resumeNewConfirm: 'Discard the old list',
    resumeNewIntro: 'The old list is deleted. Places you saved stay saved.',
    resumeFailed: 'The old list could not be discarded. Try again.',
    // Progress.
    stop: 'Stop',
    resume: 'Continue',
    looking: (done, total, line) =>
      `Looking up ${done + 1} of ${total}, “${line}”.`,
    stopped: (done, total) =>
      `Stopped after ${done} of ${total}. ${total - done === 1 ? '1 line is' : `${total - done} lines are`} not looked up yet.`,
    progressLabel: 'Lookups done',
    runningHint:
      'About a second for each name. If you reload the page, it carries on from here.',
    stoppedHint:
      'Ready places can be saved now. The rest wait until you continue.',
    announce: (done, total) => `${done} of ${total} looked up.`,
    announceDone: 'All lines are looked up.',
    tally: (ready, check, saved, same) => {
      const parts = [
        [ready, 'ready to save'],
        [check, 'to check'],
        [saved, 'already saved'],
        [same, 'the same place as another line'],
      ].filter(([n]) => n)
      return parts.length
        ? `${parts.map(([n, word]) => `${n} ${word}`).join(', ')}.`
        : ''
    },
    // Groups.
    groups: {
      check: 'To check',
      ready: 'Ready',
      wait: 'Not looked up yet',
      saved: 'Already saved',
      same: 'Same place as another line',
    },
    groupNotes: {
      saved: 'On your list already. Not saved again.',
      same: 'Found as a place another line already gave. Not saved twice.',
    },
    showAll: (n) => `Show all ${n}`,
    showFewer: 'Show fewer',
    // Rows.
    looking1: 'Looking up…',
    searchingOsm: 'Searching OpenStreetMap…',
    waiting: 'Waiting',
    savedMark: 'Already saved',
    sameAs: 'Same place as another line.',
    why: {
      several: (n) => `${n} places found. Pick the one you mean.`,
      none: 'No place found.',
      short: 'Short link, could not be read.',
      unreadable: 'Link, could not be read.',
      failed: 'Search did not answer.',
      long: 'Too long to read.',
      unusable: 'The place found could not be used.',
      coords: 'Needs a name.',
      left: 'Left out. Not saved.',
    },
    rowButton: {
      several: 'Pick',
      none: 'Rename',
      short: 'Type the name',
      unreadable: 'Type the name',
      long: 'Type the name',
      unusable: 'Rename',
      coords: 'Name it',
      left: 'Put back',
      failed: 'Try again',
      wait: 'Look up now',
      edit: 'Edit',
    },
    fromGoogle: 'From a Google Maps link',
    fromOsm: 'From an OpenStreetMap link',
    fromLink: 'From a map link',
    pastedAs: (line) => `Pasted as “${line}”`,
    set: (city, isPublic, tags) =>
      `${city}, ${isPublic ? 'public' : 'private'}${tags ? `, ${tags === 1 ? '1 tag' : `${tags} tags`}` : ''}`,
    // What an open row holds.
    detailsFor: (title) => `Details for ${title}`,
    fixFor: (title) => `Fix ${title}`,
    done: 'Done',
    leaveOut: 'Leave out',
    pickLabel: (title, address) =>
      `Pick ${title}${address ? `, ${address}` : ''}`,
    pick: 'Pick',
    candidatesFor: (line) => `Places found for “${line}”`,
    changeAndSearch: 'None of these? Change the name and search again',
    searchAgain: 'Search again',
    searchAgainHint: 'Search again as it is, or change the name first.',
    shortBody:
      'This short link could not be read. The server never follows short links.',
    shortLabel: 'Place name',
    shortHint:
      'Type the name. Or open the link yourself and paste the full address from the browser.',
    shortSubmit: 'Search',
    unreadableBody:
      'Could not read a place from this link. Type the name. The server never opens links.',
    unreadableHint:
      'Type the name. Or open the link yourself and paste the full address from the browser.',
    longBody: 'This line is too long to read. Type the place name.',
    unusableBody:
      'The place OpenStreetMap found could not be used. Change the name and search again.',
    noneBody: (name) =>
      `No place found for “${name}”. Check the spelling or add the city.`,
    failedBody:
      'The OpenStreetMap search did not answer for this line again. The line is kept.',
    coordsBody:
      'The link carries no name. The place is saved under the name you type.',
    useName: 'Use this name',
    nameRequired: 'Type a name first.',
    cancel: 'Cancel',
    close: 'Close',
    // Notices after a row action.
    foundReady: (title) => `${title} found. It is ready to save.`,
    pickedReady: (title) => `${title} picked. It is ready to save.`,
    namedReady: (title) => `${title} is ready to save.`,
    foundSaved: (title) => `${title} is already saved.`,
    foundSame: (title) => `${title} is in the list already.`,
    stillCheck: (name, why) => `“${name}”: ${why}`,
    leftOutNotice: (title) => `${title} left out. It will not be saved.`,
    putBackNotice: (title) => `${title} put back. It is ready to save.`,
    // The Save bar.
    save: 'Save places',
    saveN: (n) => (n === 1 ? 'Save 1 place' : `Save ${n} places`),
    saving: 'Saving…',
    saveNotes: {
      running: 'Press Stop to save what is ready so far.',
      allDone: 'Every line is accounted for.',
      stays: (n) => `${n} to check ${n === 1 ? 'stays' : 'stay'} in the list.`,
      notLooked: (n) =>
        `${n === 1 ? '1 line' : `${n} lines`} not looked up yet ${n === 1 ? 'stays' : 'stay'} in the list.`,
      nothingReady: 'Nothing is ready yet. Pick or rename a line above.',
      nothingToSave: 'Nothing to save. Every place is already saved.',
    },
    // After saving.
    savedHeading: (n) => (n === 1 ? 'Saved 1 place' : `Saved ${n} places`),
    savedPrivate: (n) =>
      n === 1
        ? 'It is a private spot. Only you can see it.'
        : 'They are private spots. Only you can see them.',
    savedMixed: (privateN, publicN) =>
      privateN
        ? `${privateN} private, ${publicN} on the public Denver page.`
        : `${publicN === 1 ? 'It is' : 'They are'} on the public Denver page.`,
    stillToCheck: (n) =>
      `${n} still to check. ${n === 1 ? 'It stays' : 'They stay'} in the list below.`,
    alreadySavedCount: (n) => `${n} already saved, not saved again.`,
    addAnother: 'Add another list',
    viewOnSpots: 'View on Spots',
    listGone:
      'This list is gone. It was saved or discarded in another tab, so nothing more can be saved from here.',
    startNew: 'Start a new list',
    failedNotice: (n) =>
      n === 1
        ? '1 line got no answer from the search. Try it again from its row.'
        : `${n} lines got no answer from the search. Try them again from their rows.`,
    commitFailed: 'The list was not saved. Nothing was added.',
    noAnswerRow: 'The server did not answer for this line. Try it again.',
  },
}
