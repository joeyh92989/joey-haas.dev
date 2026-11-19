/**
 * The words on the admin side of a book: the Books panel on a comic's edit
 * page and the book's own page, `/admin/shelf/comics/:id/:slug`. Voice per
 * docs/voice.md. The kind words and "Vol. n" are the public page's
 * (`spine.comics.volume`), reused, never copied.
 */

/** The five kinds, in the order the select lists them. */
export const KIND_ORDER = ['trade', 'hardcover', 'omnibus', 'compendium', 'ogn']

export const books = {
  title: 'Books',
  empty: 'No books on this title yet. Add the first one below.',
  loadFailed: 'Couldn’t load the books.',
  retry: 'Try again',
  entries: (n) => `${n} ${n === 1 ? 'entry' : 'entries'}`,
  notOwned: 'Not owned',
  list: 'Books on this title',
  add: {
    heading: 'Add a book',
    label: 'Name',
    labelHint: 'Vol. 1, Deluxe Edition, Omnibus Two',
    kind: 'Kind',
    number: 'Number in its line',
    submit: 'Add book',
    adding: 'Adding…',
    failed: 'Couldn’t add that book.',
  },
}

export const volume = {
  fallbackTitle: 'Book',
  kicker: 'Book',
  loadFailed: 'Couldn’t load this book.',
  missing: 'No book with that address on this title.',
  signIn: 'Not signed in.',
  adminHome: 'Go to admin',
  public: 'Public',
  private: 'Private',
  /** The tag on a row or a link that has no public page. */
  privateTag: 'Private',
  coverAlt: (series, label) => `Cover of ${series}, ${label}`,
  edited: 'Edited by hand',
  status: {
    heading: 'On the shelf',
    owned: 'Owned',
    read: 'Read',
    hint: 'These save the moment you press them.',
    marked: (label, what, on) => `${label}: ${what} ${on ? 'on' : 'off'}.`,
    undo: 'Undo',
    failed: 'Couldn’t save that. Try again.',
  },
  cover: {
    heading: 'Comic Vine',
    linkedNote: 'The cover and description came from Comic Vine.',
    linkFailed: 'Couldn’t read the link back.',
  },
  facts: {
    heading: 'Facts',
    label: 'Name',
    kind: 'Format',
    number: 'Number in its line',
    pages: 'Pages',
    isbn: 'ISBN',
    description: 'Description',
    save: 'Save facts',
    saving: 'Saving…',
    saved: 'Saved.',
    failed: 'Couldn’t save the facts.',
    nothing: 'Nothing has changed.',
  },
  collects: {
    heading: 'Collects',
    empty: 'Nothing is listed inside this book yet.',
    list: 'What is inside',
    add: 'Add entry',
    edit: 'Edit',
    editName: (name) => `Edit ${name}`,
    remove: 'Remove',
    removeName: (name) => `Remove ${name}`,
    removeIntro: (name) => `Take “${name}” off this book’s list?`,
    removeFor: 'Remove for good',
    moveUp: 'Move up',
    moveDown: 'Move down',
    moveUpName: (name) => `Move ${name} up`,
    moveDownName: (name) => `Move ${name} down`,
    series: 'Series as printed',
    issues: 'Issues as printed',
    issuesHint: '#1–6, Annual 1',
    linkTitle: 'Link to a comic on my shelf',
    noLink: 'No link',
    loadingTitles: 'Loading your comics…',
    titlesFailed: 'Couldn’t load your comics.',
    from: 'From issue',
    to: 'To issue',
    save: 'Save entry',
    saving: 'Saving…',
    cancel: 'Cancel',
    failed: 'Couldn’t save that.',
    linkedTo: 'Linked to',
    range: (from, to) => (from === to ? `#${from}` : `#${from}–${to}`),
    source: {
      typed: 'Typed',
      parsed: 'Read from text',
      metron: 'From Metron',
      photo: 'From a photo',
      migrated: 'Carried over',
    },
    sourceLabel: 'Source',
    read: {
      button: 'Read from description',
      reading: 'Reading…',
      hint: 'Fills in what the description or a reprint note says this book collects. It never changes an entry you typed.',
      noteToggle: 'Paste the reprint note',
      noteHide: 'Hide the reprint note',
      noteLabel: 'Reprint note',
      noteHint: 'The “Collects …” line from the back cover or the indicia.',
      failed: 'Couldn’t read the contents.',
      added: (n, replaced, usedModel) =>
        `Added ${n} ${n === 1 ? 'entry' : 'entries'}${
          replaced > 0 ? `, replacing ${replaced} read earlier` : ''
        }${usedModel ? ', read by the model' : ''}.`,
      nothingNew: 'Nothing new to add.',
      removed: (n) =>
        `Removed ${n} earlier ${n === 1 ? 'entry' : 'entries'}; nothing new found.`,
      reasons: {
        no_match: 'Found nothing in the description.',
        budget: 'Today’s model budget is used up; add the contents by hand.',
        model_error:
          'The model couldn’t read it just now; add the contents by hand.',
        no_text:
          'There is no description to read. Paste the reprint note, or add the contents by hand.',
      },
    },
    metron: {
      button: 'Find contents',
      finding: 'Looking on Metron…',
      hint: 'Asks Metron (metron.cloud) what this book collects. It only proposes: nothing is saved until you accept.',
      failed: 'Couldn’t reach Metron.',
      strong: 'The ISBN matches this book.',
      possible: 'The ISBN does not match this book. Check it before accepting.',
      noIsbn: 'This book has no ISBN to check against.',
      isbn: (isbn) => `Metron ISBN: ${isbn ?? 'none listed'}`,
      pages: (n) => `${n} pages`,
      open: 'Open on Metron',
      collects: 'It lists',
      alreadyHeld: (n) =>
        `${n} ${n === 1 ? 'entry is' : 'entries are'} left out: you already have ${n === 1 ? 'it' : 'them'}.`,
      nothingNew: 'Nothing new: everything it lists is already on this book.',
      replaces: (n) =>
        `Accepting replaces the ${n} ${n === 1 ? 'entry' : 'entries'} you took from Metron before. Typed, photo and read-from-text entries stay.`,
      accept: 'Accept these',
      dismiss: 'Dismiss',
      accepted: (n) =>
        `Added ${n} ${n === 1 ? 'entry' : 'entries'} from Metron.`,
    },
    moved: (name) => `Moved “${name}”.`,
    added: (name) => `Added “${name}”.`,
    saved: (name) => `Saved “${name}”.`,
    removed: (name) => `Removed “${name}”.`,
  },
  neighbours: {
    label: 'Neighboring books',
    previous: 'Previous',
    next: 'Next',
    first: 'This is the first book.',
    last: 'This is the last book.',
    notOwned: 'Not owned',
  },
  move: {
    heading: 'Move to another title',
    line: 'The book, its contents and its marks go with it. The title it leaves and the one it joins are both re-counted.',
    select: 'Move to',
    choose: 'Choose a comic',
    none: 'There is no other comic to move it to.',
    submit: 'Move book',
    moving: 'Moving…',
    failed: 'Couldn’t move that book.',
    kept: (slug) => `Moved. It keeps its address, ${slug}.`,
    renamed: (was, now) =>
      `Moved. ${was} was already taken on that title, so this book is now ${now}.`,
  },
  delete: {
    heading: 'Delete',
    line: 'Removes this book and its list of contents for good.',
    button: 'Delete this book',
    failed: 'Couldn’t delete that book.',
    /** The armed line, from the preview the server read. */
    detail: (preview) => {
      const parts = [`“${preview.label}” on ${preview.title}`]
      const inside =
        preview.collects_count === 0
          ? 'has no contents entries'
          : `goes with ${preview.collects_count} contents ${preview.collects_count === 1 ? 'entry' : 'entries'}`
      const lines = [`${parts[0]} ${inside}.`]
      for (const unheld of preview.issues_unheld) {
        lines.push(
          `${unheld.title}: ${unheld.count === 1 ? 'issue' : 'issues'} ${unheld.numbers} ${unheld.count === 1 ? 'stops' : 'stop'} being held.`,
        )
      }
      if (preview.read_marks_lost > 0) {
        lines.push(
          `${preview.read_marks_lost} read ${preview.read_marks_lost === 1 ? 'mark is' : 'marks are'} lost.`,
        )
      }
      return lines.join(' ')
    },
  },
  viewPublic: 'View public page',
}
