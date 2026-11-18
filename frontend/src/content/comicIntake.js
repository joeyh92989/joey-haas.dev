/**
 * Every word a comic sitting's Check step says about a book's issue number
 * (comics item, 5a). The mark under a number is decided by the server's run
 * check (`number_check`), never by the model.
 */
export const comicIntake = {
  lede: 'One entry for each cover photographed. The issue number is read from the cover; change one that is wrong, or type one that could not be read.',
  limit:
    'Whole numbers from 1 to 9999. #0, #½ and annuals can’t be recorded yet.',
  numberLabel: 'Issue number',
  collectsLabel: 'Issues it collects',
  collectsFrom: 'First issue collected',
  collectsTo: 'Last issue collected',
  formatLabel: 'This book is',
  formats: { single: 'A single issue', collected: 'A collected book' },
  editionKindLabel: 'Format',
  /** The five kinds of book the server takes (`edition_kind`). */
  editionKinds: {
    trade: 'Trade paperback',
    hardcover: 'Hardcover',
    omnibus: 'Omnibus',
    compendium: 'Compendium',
    ogn: 'Original graphic novel',
  },
  lineLabel: 'Number in the line',
  lineHint: 'Leave blank if it has none.',
  badLine: 'Whole numbers from 1 to 9999 only.',
  collectedNote:
    'Added as a book of its own, not as single issues. Without a range it still adds the book.',
  /** What committing one entry adds, one plain line under its title. */
  addsIssue: (number, title) =>
    number == null
      ? `Adds an issue to ${title}`
      : `Adds issue #${number} to ${title}`,
  addsBook: (title) => `Adds a book to ${title}`,
  addsNewTitle: (title) => `Starts a new title: ${title}`,
  addsTo: (title) => `Adds to ${title}`,
  contentsHead: 'Contents',
  contentsLine: (series, issues) => `${series} · ${issues}`,
  willLink: 'will count toward the run',
  contentsEmpty:
    'Nothing read yet - you can add contents on the book’s page after',
  alreadyHave: (label) => ({
    before: 'You already have ',
    label,
    after: ' with these issues. Adding it makes a second book.',
  }),
  marks: {
    in_run: 'Read from the cover. In the run.',
    out_of_run: 'Read from the cover. Not in this series’ run.',
    read: 'Read from the cover.',
    typed: 'Typed.',
    none: 'Couldn’t read the number. Type it.',
  },
  badNumber: 'Whole numbers from 1 to 9999 only.',
  badRange: 'Give the first and the last issue, first to last.',
  duplicate: 'Already in this sitting',
  addsHead: 'What this adds',
  adds: (ranges) => `adds ${ranges}`,
  addsEdition: (edition) =>
    `adds ${edition.label} (${edition.kind}, #${edition.from}${
      edition.to === edition.from ? '' : `–${edition.to}`
    })`,
  addsNothing: 'adds nothing yet',
  /** A collected book with no range: it still adds a book (or its title). */
  addsBooks: (n) => (n === 1 ? 'adds a book' : `adds ${n} books`),
  startsTitle: 'starts a new title',
  alreadyHeld: (ranges) => `${ranges} already on the shelf`,
  needNumber: (n) => `${n} ${n === 1 ? 'book needs' : 'books need'} a number`,
  nextHeld: (n) =>
    `${n === 1 ? '1 book needs' : `${n} books need`} a number first.`,
  nothingTicked: 'Nothing ticked.',
  doneHead: 'Added to the shelf',
  doneBooksHead: 'New books',
  doneTitlesHead: 'New titles',
  doneBookCount: (n) => `${n} new ${n === 1 ? 'book' : 'books'}`,
  doneTitleCount: (n) => `${n} new ${n === 1 ? 'title' : 'titles'}`,
  doneLineNumber: (n) => `Vol. ${n}`,
  doneLine: (title, what) => `${title} · ${what}`,
}
