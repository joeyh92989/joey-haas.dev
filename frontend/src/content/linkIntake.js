/**
 * Every word the closet's "From links" way in says (issue #398): the add
 * bar's button and paste panel, and Check's cards for pasted product links.
 */
export const linkIntake = {
  button: 'From links',
  buttonLabel: 'Add from product links',
  panelLabel: 'Product links',
  fieldLabel: 'Product links, one per line',
  placeholder: 'https://…/products/…',
  help: (max) =>
    `Paste up to ${max} product links, one per line. The store's own page gives the name, colors, sizes and photo; nothing is added until you press Add.`,
  read: 'Read the links',
  reading: 'Reading the links…',
  cancel: 'Cancel',
  label: (when) => `From links · ${when}`,
  tooMany: (max) => `Paste at most ${max} links at a time`,
  failed: 'The links could not be read.',
  noAnswer: 'The server did not answer; try again.',
  head: (n) => `From links · ${n}`,
  lede: 'Each piece is a draft until you press Add. Choose a color and size where the store offers several, and correct anything the store called it.',
  from: (host, via) => (via ? `${host} · read from ${via}` : host),
  via: { shopify: 'the store’s product data', jsonld: 'the page’s data' },
  kept: 'Kept as typed',
  keptWhy: (message) => message ?? 'Nothing could be read from this link.',
  open: 'Open the link',
  color: 'Color',
  chooseColor: 'Choose a color',
  needsColor: 'a color choice',
  size: 'Size',
  chooseSize: 'Choose a size',
  soldOut: 'sold out',
  noColorListed: 'No color listed',
  needs: (labels) => `Needs ${labels.join(' and ')}`,
  noPhoto: 'No photo',
  noPhotoWhy: {
    none: 'The store gave no photo.',
    pending: 'Fetching the photo…',
  },
  photoFailed: (why) => `No photo: ${why}`,
  photosLeft: (n) => `Fetching photos · ${n} left`,
  photosFailed:
    'The photos could not be fetched; the pieces are added without one.',
  remove: 'Remove from this batch',
  removeAsk: (name) => `Remove ${name} from this batch?`,
  removeYes: 'Yes, remove it',
  removeKeep: 'Keep it',
  removed: (name) => `${name} removed`,
  notes: (counts) =>
    [
      counts.kept > 0 &&
        `${counts.kept} kept as typed (the store could not be read)`,
      counts.not_links > 0 && `${counts.not_links} not links, left out`,
      counts.duplicates > 0 && `${counts.duplicates} already in the batch`,
    ].filter(Boolean),
  hint: 'Pieces from links wait in the tag queue for warmth, formality and seasons; their store color, brand and size stay as the store said.',
}
