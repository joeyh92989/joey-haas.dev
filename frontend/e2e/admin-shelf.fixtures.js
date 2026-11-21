import { readFileSync } from 'node:fs'

// Realistic admin rows for the Games and Comics lists (#532, slice b),
// served from the page so the spec needs no backend: long titles, an
// unbroken 60-character name, many tags per row, private rows, a favorite,
// a game on the Switch 2 with no recorded format, and series with long
// publisher names. The tag keys come from the real vocabulary.

const VOCAB = JSON.parse(
  readFileSync(
    new URL('../src/content/tagVocabulary.json', import.meta.url),
    'utf8',
  ),
)

const UNBROKEN = 'Supercalifragilisticexpialidocious_Unbreakable_Name_Of_60Ch'
const TITLES = [
  'The Legend of Zelda: Tears of the Kingdom – Collector’s Edition Deluxe Anniversary Remaster',
  UNBROKEN,
  'Star Fox',
  'Dune: Spice Wars',
  'Hades',
  'Disco Elysium: The Final Cut',
  'Pikmin 4',
  'A Very Long Title That Keeps Going For Quite A While Because Publishers Do That Sometimes: Part Two',
  'Celeste',
  'Hollow Knight: Silksong',
  'Return of the Obra Dinn',
  'Outer Wilds',
  'Tunic',
  'Stardew Valley',
  'Baldur’s Gate 3',
  'Metroid Dread',
  'Cocoon',
  'Inscryption',
  'Sea of Stars',
  'Pizza Tower',
  'Animal Well',
  'Balatro',
  'Dredge',
  'Unpacking',
  'Wargroove 2: Pocket Edition',
  'Kirby and the Forgotten Land',
  'Super Mario Odyssey',
  'Fire Emblem: Three Houses',
  'Xenoblade Chronicles 3: Future Redeemed',
  'Chants of Sennaar',
]
const STATUSES = ['backlog', 'active', 'finished', 'abandoned', 'paused']

function tagsFor(type, index) {
  const tags = []
  for (const [position, group] of VOCAB[type].entries()) {
    // Several tags per group, more on the first rows: the worst case.
    const count = index < 4 ? 3 : (index + position) % 3
    for (let n = 0; n < count; n++) {
      const tag = group.tags[(index * 3 + n * 5 + position) % group.tags.length]
      if (!tags.some((t) => t.group === group.key && t.tag === tag))
        tags.push({ group: group.key, tag })
    }
  }
  return tags
}

export const GAMES = TITLES.map((title, index) => ({
  id: `00000000-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`,
  type: 'game',
  title,
  status: STATUSES[index % STATUSES.length],
  rating: index % 3 === 0 ? null : 3 + (index % 7),
  favorite: index === 2 || index === 5,
  wanted: index % 11 === 10,
  is_public: index % 4 !== 1,
  year: 2015 + (index % 11),
  creator: index % 2 ? 'Nintendo EPD' : 'Supergiant Games',
  platform: index % 5 === 0 ? 'Nintendo Switch 2' : 'Nintendo Switch',
  platform_id: index % 5 === 0 ? 508 : 130,
  physical_format: index % 5 === 0 ? null : 'cartridge',
  owned_format: index % 6 === 5 ? 'none' : 'physical',
  cover_url: null,
  finished_at: index % STATUSES.length === 2 ? '2026-03-14' : null,
  times_completed: index % STATUSES.length === 2 ? 1 + (index % 2) : 0,
  created_at: `2026-0${1 + (index % 9)}-1${index % 9}T00:00:00Z`,
  pinned_at: null,
  genres: ['Adventure'],
  tags: tagsFor('game', index),
}))

const run = (owned, released, fields = {}) => ({
  owned,
  released,
  missing: released - owned,
  state: owned === released ? 'complete' : 'gaps',
  ongoing: released > owned,
  segments: [
    { kind: 'owned', length: owned },
    ...(released > owned
      ? [{ kind: 'missing', length: released - owned }]
      : []),
  ],
  read: Math.floor(owned / 2),
  unread: Math.ceil(owned / 2),
  read_next: null,
  owned_text: `1–${owned}`,
  ...fields,
})

const COMIC_TITLES = [
  'Saga',
  'Monstress',
  'The Absolutely Unbelievably Long Titled Series of Adventures in Space and Time, Volume Seven Hundred',
  UNBROKEN,
  'Paper Girls',
  'Ex Machina',
  'Locke & Key',
  'The Wicked + The Divine',
  'Descender',
  'East of West',
  'Y: The Last Man',
  'Sandman Mystery Theatre',
  'Black Hammer',
  'Criminal',
  'Hellboy and the B.P.R.D.',
  'Usagi Yojimbo',
  'Lumberjanes',
  'Batman: The Dark Knight Strikes Again',
]
const PUBLISHERS = [
  'Image',
  'Dark Horse Comics',
  'Vertigo',
  'The Extremely Long Named Independent Comics Publishing House Of America',
  'BOOM! Studios',
]

export const COMICS = COMIC_TITLES.map((title, index) => ({
  id: `00000000-bbbb-4bbb-8bbb-${String(index).padStart(12, '0')}`,
  type: 'comic',
  title,
  status: ['backlog', 'active', 'finished'][index % 3],
  rating: index % 4 === 0 ? 8 : null,
  is_public: index % 4 !== 1,
  year: 2005 + index,
  creator: PUBLISHERS[index % PUBLISHERS.length],
  cover_url: null,
  external_source: 'comicvine',
  external_id: String(4050 + index),
  owned_format: 'physical',
  following: index % 2 === 0,
  read_to: 3,
  comic_run: run(10 + index, 12 + index * 2, { kind: 'series' }),
  created_at: `2026-0${1 + (index % 9)}-0${1 + (index % 9)}T00:00:00Z`,
  tags: tagsFor('comic', index),
}))

/**
 * Serves the session and the admin rows. `rows` are copied, and the writes
 * the lists make (visibility, rating and status PATCHes, follow, pin) change
 * the copy, so the page's reload shows what the click did.
 */
export async function serveAdmin(page, rows) {
  const live = structuredClone(rows)
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const json = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })
    const path = url.pathname
    const body = () => {
      try {
        return JSON.parse(request.postData() ?? '{}')
      } catch {
        return {}
      }
    }
    if (path === '/api/auth/me') return json({ email: 'admin@example.com' })
    if (path === '/api/items' && method === 'GET') return json(live)
    if (path === '/api/items/delete-preview')
      return json({
        items: 1,
        playthroughs: 2,
        play_sessions: 0,
        comic_issues: 14,
        pick_events: 0,
        titles: ['A title'],
      })
    const item = path.match(/^\/api\/items\/([\w-]+)(\/pin)?$/)
    if (item) {
      const row = live.find((entry) => entry.id === item[1])
      if (!row) return json({}, 404)
      if (item[2]) {
        row.pinned_at = method === 'DELETE' ? null : '2026-11-20T00:00:00Z'
        return json(row)
      }
      if (method === 'PATCH') return json(Object.assign(row, body()))
    }
    if (path === '/api/comics/follow' || path === '/api/comics/unfollow') {
      const row = live.find((entry) => entry.external_id === body().external_id)
      if (row) row.following = path.endsWith('/follow')
      return json({})
    }
    if (path === '/api/intake/counts') return json({ shelf: 0, closet: 0 })
    if (path.startsWith('/api/closet')) return json({}, 404)
    if (path === '/api/track') return route.abort()
    return json({})
  })
}
