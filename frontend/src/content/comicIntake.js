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
  formats: { single: 'A single issue', collected: 'A collected edition' },
  editionKindLabel: 'Edition',
  editionKinds: { trade: 'Trade', omnibus: 'Omnibus', hardcover: 'Hardcover' },
  collectedNote:
    'Added to the series as a book, not as single issues. Without a range it adds the series only.',
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
  alreadyHeld: (ranges) => `${ranges} already on the shelf`,
  needNumber: (n) => `${n} ${n === 1 ? 'book needs' : 'books need'} a number`,
  nextHeld: (n) =>
    `${n === 1 ? '1 book needs' : `${n} books need`} a number first.`,
  nothingTicked: 'Nothing ticked.',
  doneHead: 'Added to the shelf',
  doneLine: (title, what) => `${title} · ${what}`,
}
