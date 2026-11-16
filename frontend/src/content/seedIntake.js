/**
 * Every word the closet's "From a file" way in says (issue #396): the add
 * bar's button, Check's product cards and Done's counts. The seed file's
 * rows are purchase history, so nothing here names a real piece or store
 * order.
 */
export const seedIntake = {
  button: 'From a file',
  buttonLabel: 'Add from a file',
  fileLabel: 'Seed file',
  label: (when) => `From a file · ${when}`,
  tooLarge: (name, kb) => `${name} is over ${kb} KB, too large for a seed file`,
  notCsv: (name) => `${name} is not a CSV file`,
  uploading: 'Reading the file…',
  uploadFailed: 'The file could not be read.',
  head: (n) => `From the file · ${n}`,
  lede: 'Each piece is a draft until you press Add. Correct what the store called it, give the pieces a category and colour where one is missing, and mark anything you do not own.',
  photosLeft: (n) => `Fetching photos · ${n} left`,
  photosDone: 'Photos fetched.',
  photosFailed:
    'The photos could not be fetched; the pieces are added without one.',
  noPhoto: 'No photo',
  noPhotoWhy: {
    none: 'The file had no photo address.',
    pending: 'Fetching the photo…',
  },
  photoFailed: (why) => `No photo: ${why}`,
  from: (source, order) => (order ? `${source} · order ${order}` : source),
  needs: (labels) => `Needs ${labels.join(' and ')}`,
  dontOwn: 'Don’t own this',
  dontOwnAsk: (name) =>
    `Mark ${name} as not owned? It is skipped in every later file too.`,
  dontOwnYes: 'Yes, not owned',
  dontOwnKeep: 'Keep it',
  dontOwnDone: (name) => `${name} marked not owned`,
  remove: 'Remove from this sitting',
  noAnswer: 'The server did not answer; try again.',
  done: {
    skippedNotOwned: 'skipped, not owned',
    skippedKnown: 'skipped, marked not owned before',
    alreadyImported: 'skipped, already imported',
    duplicates: 'repeated in the file',
    unreadable: 'lines not understood',
    withoutPhoto: 'added without a photo',
  },
  hint: 'Pieces from a file wait in the tag queue for warmth, formality and seasons; their store colour, brand and size stay as the store said.',
}
