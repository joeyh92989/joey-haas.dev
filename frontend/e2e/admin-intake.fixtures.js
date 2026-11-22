// Sitting answers for the style dump's slice D5b scenarios (#536): a comic
// sitting at Check (books, series that grow, a skim grid, a title to ask
// about), the same at Details and Done, a shoot step with every photo state,
// and Closet sittings at Check (garments, a seed file, pasted links). They
// override `serveAdminAdd`'s sitting routes; nothing is written. Kept apart
// from admin-add.fixtures.js, which other work edits.
import { GARMENTS } from './closet-mocks.js'

const photo = (id, state, extra = {}) => ({
  id,
  state,
  filename: `${id}.jpg`,
  error: state === 'failed' ? 'The model could not read this photo.' : null,
  ...extra,
})

const chosen = (id, title, extra = {}) => ({
  external_source: 'comicvine',
  external_id: String(id),
  title,
  year: 2012,
  publisher: 'Image',
  thumbnail_url: null,
  cover_url: null,
  ...extra,
})

const base = (id, entries, extra = {}) => ({
  id,
  area: 'shelf',
  kind: 'comic',
  label: 'Saturday comics, a long label that wraps on a phone',
  step: 'check',
  photos: [
    photo('p1', 'read'),
    photo('p2', 'read'),
    photo('p3', 'read'),
    photo('p4', 'read'),
    photo('p5', 'read'),
    photo('p6', 'read'),
  ],
  photos_waiting: 0,
  entries,
  created_at: '2026-11-10T19:42:00Z',
  updated_at: '2026-11-10T19:42:00Z',
  ...extra,
})

const comic = (id, photoId, state, payload, extra = {}) => ({
  id,
  photo_id: photoId,
  kind: 'comic',
  state,
  payload: { detected_title: 'Saga', detected_year: 2012, ...payload },
  candidates: [],
  chosen: null,
  garment_id: null,
  ...extra,
})

const book = (id, photoId, title, payload, extra = {}) =>
  comic(
    id,
    photoId,
    'exact',
    {
      detected_title: title,
      number_source: 'cover',
      format: 'single',
      ...payload,
    },
    { chosen: chosen(id, title), ...extra },
  )

const HELD = {
  item_id: 'it1',
  title: 'Monstress',
  cover_url: null,
  owned_text: '1-40, 43',
  released: 56,
  ongoing: true,
}

/** A comic sitting on Check: one to ask about, books, series that grow, a grid. */
export const COMIC_CHECK = base('ck', [
  comic(
    'q1',
    'p1',
    'check',
    { detected_title: 'Descender', reason: 'Two series match.' },
    {
      candidates: [
        chosen(10, 'Descender'),
        chosen(11, 'Descender: Rise of the Machine', { year: 2016 }),
      ],
    },
  ),
  comic(
    'q2',
    'p6',
    'probable',
    { detected_title: 'Paper Girls' },
    {
      candidates: [chosen(12, 'Paper Girls')],
      chosen: chosen(12, 'Paper Girls'),
    },
  ),
  book(
    'b1',
    'p2',
    'Saga',
    { issue_number: 4 },
    {
      number_check: { state: 'in_run' },
      adds: { kind: 'issue', issue_number: 4, title: 'Saga' },
    },
  ),
  book(
    'b2',
    'p3',
    'Saga',
    { issue_number: 4 },
    {
      number_check: { state: 'out_of_run' },
      adds: { kind: 'issue', issue_number: 4, title: 'Saga' },
    },
  ),
  book(
    'b3',
    'p4',
    'East of West',
    {},
    {
      number_check: { state: 'none' },
      adds: { kind: 'issue', issue_number: null, title: 'East of West' },
    },
  ),
  book(
    'b4',
    'p5',
    'The Wicked + The Divine Omnibus',
    {
      format: 'collected',
      edition_kind: 'omnibus',
      collects_from: 1,
      collects_to: 11,
      line_number: 2,
    },
    {
      already_held: { label: 'Volume 1', slug: 'volume-1' },
      title_will_be_created: true,
      adds: { kind: 'book', title: 'The Wicked + The Divine' },
      contents_preview: [
        {
          series_name: 'The Wicked + The Divine',
          issue_text: '#1-11',
          will_link: true,
        },
        { series_name: 'Extras', issue_text: '#1', will_link: false },
      ],
    },
  ),
  {
    ...book('b5', 'p2', 'Ignored book', {
      issue_number: 9,
      unticked: true,
      was: 'exact',
    }),
    state: 'ignored',
    number_check: { state: 'read' },
  },
  // A series already on the shelf: its row says what it adds.
  comic(
    'g1',
    'p3',
    'exact',
    { detected_title: 'Monstress', issues_owned: '41, 42, 44' },
    { chosen: chosen(20, 'Monstress'), on_shelf: HELD },
  ),
  comic(
    'g2',
    'p4',
    'exact',
    { detected_title: 'Monstress' },
    { chosen: chosen(20, 'Monstress'), on_shelf: { ...HELD, ongoing: false } },
  ),
  comic(
    'g3',
    'p5',
    'ignored',
    {
      detected_title: 'Monstress',
      issues_owned: '41',
      unticked: true,
      was: 'exact',
    },
    { chosen: chosen(20, 'Monstress'), on_shelf: HELD },
  ),
  // The skim grid: an exact match, an owned one, one unticked.
  comic(
    'k1',
    'p6',
    'exact',
    { detected_title: 'Lazarus' },
    { chosen: chosen(30, 'Lazarus') },
  ),
  comic(
    'k2',
    'p6',
    'owned',
    { detected_title: 'Invincible' },
    { chosen: chosen(31, 'Invincible') },
  ),
  comic(
    'k3',
    'p6',
    'ignored',
    { detected_title: 'Fables', unticked: true, was: 'exact' },
    { chosen: chosen(32, 'Fables') },
  ),
  comic(
    'k4',
    'p6',
    'typed',
    { title: 'Typed series' },
    {
      chosen: chosen(33, 'Typed series'),
      books_preview: [
        {
          label: 'Book one',
          edition_kind: 'trade',
          from: 1,
          to: 6,
          isbn: '9781534300000',
        },
      ],
    },
  ),
])

/** The same sitting on Details. */
export const COMIC_DETAILS = base(
  'cd',
  [
    comic(
      'd1',
      'p1',
      'ready',
      { detected_title: 'Saga' },
      { chosen: chosen(1, 'Saga') },
    ),
    comic(
      'd2',
      'p2',
      'exact',
      { detected_title: 'Descender' },
      { chosen: chosen(10, 'Descender') },
    ),
  ],
  { step: 'details' },
)

/** A sitting on Shoot with every photo state, typed titles and a refusal. */
export const SHOOT_ALL = {
  ...COMIC_CHECK,
  id: 'sh',
  step: 'shoot',
  photos: [
    photo('p1', 'read'),
    photo('p2', 'reading'),
    photo('p3', 'uploaded'),
    photo('p4', 'empty'),
    photo('p5', 'failed'),
    photo('p6', 'uploaded'),
  ],
  photos_waiting: 2,
}

const garmentEntry = (id, garmentId, extra = {}) => ({
  id,
  photo_id: `ph-${id}`,
  kind: 'garment',
  state: 'exact',
  payload: {},
  candidates: [],
  chosen: null,
  garment_id: garmentId,
  ...extra,
})

const closetBase = (id, entries) => ({
  ...base(id, entries, {
    area: 'closet',
    kind: 'garment',
    label: 'Autumn clear-out',
  }),
  photos: entries.map((entry) =>
    photo(entry.photo_id ?? `x-${entry.id}`, 'read'),
  ),
})

/** Closet sitting at Check: tagged garments, one to ask about, one queued. */
export const CLOSET_CHECK = closetBase('cl', [
  garmentEntry('e1', 'a'),
  garmentEntry('e2', 'b'),
  garmentEntry('e3', 'x1'),
  garmentEntry('e4', 'd'),
])

/** The garments the sitting's Check reads: one the tagger gave up on. */
export const EXTRA_GARMENTS = [
  {
    id: 'x1',
    name: null,
    category: null,
    brand: null,
    primary_color: null,
    primary_hex: null,
    status: 'untagged',
    tag_source: null,
    tag_attempts: 3,
    image: '/api/closet/garments/x1/image?v=1',
  },
]

const seedPayload = (extra = {}) => ({
  seed: { source: 'Uniqlo', order_id: 'A-1042' },
  name: 'Linen shirt',
  brand: 'Uniqlo',
  color_name: 'Sand',
  size: 'M',
  category: 'top',
  primary_color: 'sand',
  image: 'done',
  ...extra,
})

/** A seed-file sitting: a piece with a photo, one without, one failed. */
export const CLOSET_SEED = closetBase('cs', [
  {
    ...garmentEntry('s1', null),
    payload: seedPayload(),
  },
  {
    ...garmentEntry('s2', null, { photo_id: null }),
    payload: seedPayload({ name: null, size: '', image: 'none' }),
  },
  {
    ...garmentEntry('s3', null, { photo_id: null }),
    payload: seedPayload({
      name: 'Wool overcoat with a long name',
      image: 'failed',
      image_error: 'the store refused',
    }),
  },
])

const color = (id, name, sizes) => ({
  external_source: 'store',
  external_id: id,
  title: name,
  sizes,
})

/** A pasted-links sitting: a colour to choose, a kept link, one done. */
export const CLOSET_LINKS = closetBase('cp', [
  {
    ...garmentEntry('l1', null),
    candidates: [
      color('c1', 'Navy', [{ size: 'S' }, { size: 'M' }]),
      color('c2', 'Olive', [{ size: 'M' }]),
    ],
    payload: {
      link: { url: 'https://store.example/shirt', via: 'page', state: 'read' },
      name: 'Oxford shirt',
      brand: 'Store',
      color_name: '',
      image: 'done',
      seed: { row: { chosen: 'c1' } },
    },
  },
  {
    ...garmentEntry('l2', null, { photo_id: null }),
    payload: {
      link: {
        url: 'https://store.example/gone',
        via: 'page',
        state: 'kept',
        message: 'The page did not load.',
      },
      image: 'none',
    },
  },
])

const BY_ID = {
  ck: COMIC_CHECK,
  cd: COMIC_DETAILS,
  sh: SHOOT_ALL,
  cl: CLOSET_CHECK,
  cs: CLOSET_SEED,
  cp: CLOSET_LINKS,
}

/**
 * Routes this file's sittings (and the extra garments of the Closet one)
 * over whatever answered before; call it after the page's own mocks.
 */
export async function serveIntakeD5b(page) {
  await page.route('**/api/intake/sittings/*', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop()
    if (route.request().method() !== 'GET' || !BY_ID[id])
      return route.fallback()
    return route.fulfill({ json: BY_ID[id] })
  })
  await page.route('**/api/closet/garments', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const garments = [...GARMENTS, ...EXTRA_GARMENTS]
    return route.fulfill({
      json: { garments, counts: { total: garments.length } },
    })
  })
}
