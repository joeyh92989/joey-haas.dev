/**
 * Every word the ISBN way in says (story #336): the box on a collected
 * book's row, the lookup's answers and the barcode scanner sheet.
 */
export const isbnIntake = {
  label: 'ISBN',
  placeholder: '978…',
  lookUp: 'Look up',
  looking: 'Looking up…',
  scan: 'Scan',
  scanLabel: 'Scan the barcode with the camera',
  badIsbn: 'That is not a valid ISBN: check the digits.',
  found: (line) => `Found: ${line}`,
  fillNote: 'The label was filled in from it; change anything that is off.',
  notFound:
    'No book found for that ISBN. Type the label yourself; the ISBN is kept.',
  rateLimited: 'Open Library is busy. Try again in a moment, or type it.',
  unavailable: 'Open Library did not answer. Type it; the ISBN is kept.',
  noAnswer: 'The server did not answer. Type it; the ISBN is kept.',
  onShelf: {
    before: 'Already on your shelf: ',
    after: '. Adding it again makes a second book.',
  },
  scannerTitle: 'Scan a barcode',
  scannerHelp:
    'Hold the book’s barcode (the long one on the back) in front of the camera.',
  scannerStarting: 'Starting the camera…',
  scannerDenied:
    'The camera is blocked or missing. Allow it in the browser’s settings, or type the ISBN instead.',
  scannerFailed: 'The scanner could not start. Type the ISBN instead.',
  scannerNotIsbn:
    'That barcode is not a book’s ISBN. Keep looking, or type it.',
  scannerClose: 'Close',
  // The add bar's barcode button.
  barScan: 'Scan a barcode',
  barNotFound: (isbn) => `No book found for ${isbn}. Search by title instead.`,
  barFound: (title) => `Searching for “${title}” from the barcode.`,
}
