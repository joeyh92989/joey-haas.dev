/**
 * Every word the garment page's photo and product panel says (issue #399):
 * adding or replacing a photo, and attaching a store product to a garment
 * that already exists. Kept here so the admin copy scan finds no inline
 * strings in the page.
 */
export const productCopy = {
  heading: 'Photo and product',
  addPhoto: 'Add photo',
  replacePhoto: 'Replace photo',
  photoBusy: 'Saving the photo…',
  photoDone: 'Photo saved.',
  photoFailed: 'The photo did not reach the server. Check your connection.',
  photoInput: 'Photo file',
  linkLabel: 'Product link',
  linkHint: 'https://store.example/products/…',
  lookUp: 'Look it up',
  lookingUp: 'Reading the link…',
  lookFailed: 'The link could not be read. Check your connection.',
  refusedTail: 'You can still add a photo.',
  colorLegend: 'Color',
  sizeLabel: 'Size in this color',
  sizeNone: 'Choose a size',
  noColor: 'No color listed',
  replaceBrand: (current, found) =>
    `Replace the brand “${current}” with “${found}”`,
  replaceProduct: (title) =>
    `This garment already has a product (${title || 'untitled'}). Replace it.`,
  replaceColor: (current, found) =>
    `Replace the color “${current}” with “${found}”`,
  replaceSize: (current, found) =>
    `Replace the size “${current}” with “${found}”`,
  kept: (fields) => ` Kept your ${fields.join(' and ')}.`,
  keepsPhoto: 'Its photo stays as it is.',
  addsPhoto: 'This color’s photo is added.',
  unsavedNote: 'Attaching replaces any unsaved edits in the form below.',
  attach: 'Attach product',
  attaching: 'Attaching…',
  attachFailed: 'The product did not attach. Check your connection.',
  attached: 'Product attached.',
  photoOutcome: {
    added: 'Its photo was added.',
    kept: 'Its photo was kept.',
    none: 'This color has no photo to add.',
    failed: (why) => `The photo could not be added (${why}). Add one yourself.`,
  },
}
