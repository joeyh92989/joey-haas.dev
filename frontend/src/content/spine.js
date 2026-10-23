import { profile } from './profile.js'
import { LOAD_ERROR, WAKING } from './status.js'

/**
 * Spine's public copy: the tracker's name and the lines that say what it is.
 *
 * One home for the wording, so a change touches one file. `tagline` is the
 * canonical line and appears only as the /spine lede; `projectsTagline` is
 * a deliberate shorter variant for the Projects card (Spine brief, "The
 * name"). Link labels carry no arrow: pages append it.
 *
 * Voice, for every public string on the site: contractions ("I'm",
 * "what's") and American spelling (favorites, catalog, normalized, colors).
 * Only words a visitor reads move; routes such as /admin/catalogue, module
 * names and API fields such as `catalogue` keep their spelling, since
 * renaming them would break links and the API contract.
 */
/** The tour, and the post it shortens: the post is the long version. */
const links = {
  post: { to: '/shelf/how', label: 'How it works' },
  longVersion: { to: '/blog/how-spine-works', label: 'The long version' },
  source: { href: profile.repo, label: 'Source' },
}

export const spine = {
  name: 'My Shelf',
  path: '/shelf',
  tagline:
    'A tracker for my physical game collection: what I own, what I’ve finished, and what to play next.',
  projectsTagline: 'A tracker for my physical game collection',
  homeLine:
    'A tracker for my physical game collection: it reads the shelf from a photo, knows which boxes hold a real cartridge, and picks what to play next.',
  projectLine:
    'I built this myself: React and FastAPI on free tiers, Postgres on Neon, and a camera pointed at the shelf.',
  links,
  tabs: {
    shelf: { to: '/shelf', label: 'Collection' },
    next: { to: '/shelf/next', label: 'What’s next' },
    year: { to: '/shelf/year', label: 'Year in review' },
    how: { to: '/shelf/how', label: 'How it works' },
  },
  /**
   * /spine/how, the field guide (Spine tour spec). Each stop's `code` paths
   * are repo-relative and spine.test.js checks they exist. Capture rows are
   * drawn and illustrative: the real figures behind them (scores, stores,
   * prices) never reach the public API, so they can't be shown live.
   */
  how: {
    path: '/shelf/how',
    title: 'How My Shelf works, in eight stops',
    description:
      'A guided tour of My Shelf: photo import, the physical catalog, Play Next, Radar, Discover, and the nightly job, with each public result beside the signed-in tool that made it.',
    lede: 'Everything on the Collection and What’s next pages comes out of a pipeline I run for myself. Each stop pairs the public result with a drawing of the signed-in tool that made it and links to the code it runs.',
    tocLabel: 'Stops',
    live: 'Live, from the public API',
    behind: 'Behind the sign-in',
    stopLabel: 'Stop',
    featuresLabel: 'What it does',
    tour: 'Take the tour',
    redacted: 'store withheld',
    // Stop 2's facts once /api/public/status answers: the catalog line is
    // added and the stores line gains its listings.
    counts: {
      catalog: 'Catalog',
      titles: (titles, platforms) =>
        `${titles} matched titles on ${platforms} platforms`,
      stores: 'Stores',
      listings: (watched, listings) =>
        `${watched} watched, ${listings} listings`,
    },
    features: [
      {
        stop: 1,
        title: 'Reads the shelf',
        line: 'One photo in, titles out, matched to IGDB.',
      },
      {
        stop: 2,
        title: 'Knows the format',
        line: 'Cartridge or Game-Key Card, pulled from a registry and twelve stores.',
      },
      {
        stop: 3,
        title: 'Picks tonight',
        line: 'Six weighted terms score the backlog and explain each pick.',
      },
      {
        stop: 4,
        title: 'Watches the stores',
        line: 'What’s out, what’s coming, what to skip.',
      },
      {
        stop: 7,
        title: 'Rebuilds nightly',
        line: 'Nothing here waits for me to press a button.',
      },
    ],
    stops: [
      {
        n: 1,
        where: '/admin/import',
        title: 'Reads the shelf from a photo',
        claim:
          'A vision model reads the titles off a photo of the shelf. It’s never asked how confident it is: the server compares each title against IGDB by string similarity and marks the match exact, probable, or uncertain, so I only have to check the doubtful ones.',
        why: {
          lead: 'Why this way:',
          text: 'a model’s confidence can’t be tested, but a similarity score can. The model returns titles only, so the entire matching path runs in tests without ever calling the model.',
        },
        code: ['backend/importer.py', 'backend/matching.py'],
        live: {
          caption:
            'The newest games on the shelf. The import itself isn’t public: nothing from a photo is kept after the request completes.',
          empty: 'Nothing on the shelf yet.',
        },
        capture: {
          url: '/admin/import',
          tag: 'signed in',
          note: 'The signed-in tool, drawn, with illustrative rows. The model returns titles; the server does the matching.',
          columns: ['Title', 'Match', 'Confidence'],
          rows: [
            ['DREDGE', 'Dredge', { pill: 'exact', tone: 'ok' }],
            [
              'DAEMON X MACHINA',
              'Daemon X Machina',
              { pill: 'exact', tone: 'ok' },
            ],
            [
              'OBRA DINN',
              'Return of the Obra Dinn',
              { pill: 'probable', tone: 'warn' },
            ],
            [
              'NIGHT TRAP',
              'Night Trap: 25th Anniversary Edition',
              { pill: 'uncertain', tone: 'warn' },
            ],
          ],
        },
      },
      {
        n: 2,
        where: '/admin/catalogue',
        title: 'Knows cartridge from Game-Key Card',
        claim:
          'A Switch 2 box can hold the full game or only a key to download it. My Shelf reads the r/NSCollectors registry, the Switch 1 release sheet, and twelve boutique stores, and collapses them to one honest format per game.',
        why: {
          lead: 'The collapse rule:',
          text: 'any full cartridge in the home region makes a game a cartridge, because a registry row and a store listing usually describe different editions of the same title. Switch 1 is region-free, so any region counts there. A format I recorded from my own copy is never overwritten.',
        },
        code: ['backend/physical_sources/collapse.py', 'backend/formats.py'],
        live: {
          caption:
            'From What’s next: a full cartridge, and a row I skip because the box holds a key, not the game.',
          empty: 'No rows on What’s next yet.',
        },
        capture: {
          url: '/admin/catalogue',
          tag: 'signed in',
          note: 'Store names and prices never leave the signed-in page. Rows are illustrative.',
          facts: [
            ['Switch 2 registry', 'refreshed nightly'],
            ['Switch 1 sheet', 'about 4,500 titles, about 10,000 editions'],
            ['Stores', '12 watched'],
          ],
          columns: ['Game', 'Registry', 'Store', 'Collapsed to'],
          rows: [
            [
              'Game A',
              'Game-Key Card (EU)',
              { redacted: 'cartridge (US)' },
              { pill: 'cartridge', tone: 'ok' },
            ],
            [
              'Game B',
              'Game-Key Card (US)',
              { redacted: 'Game-Key Card' },
              { pill: 'Game-Key Card', tone: 'warn' },
            ],
            [
              'Game C',
              '—',
              { redacted: 'cartridge (US)' },
              { pill: 'cartridge', tone: 'ok' },
            ],
          ],
        },
      },
      {
        n: 3,
        where: '/admin/play-next',
        title: 'Picks tonight’s game',
        claim:
          'Six weighted terms score the backlog: how much I’ve liked games like it, how close it is to my favorites, how well it’s rated, whether it fits the evening, how long it’s been waiting, and a little random jitter. Each pick comes with a reason.',
        why: {
          lead: 'No model here.',
          text: 'The scoring is pure Python, tested without a database, and the public reasons are always rebuilt from public games only.',
        },
        code: ['backend/picker.py'],
        live: {
          caption:
            'Up next, which I pin by hand, and the day’s picks, which change at most once a day.',
          empty: 'Nothing lined up for tonight.',
        },
        capture: {
          url: '/admin/play-next',
          tag: 'signed in',
          note: 'Each term is 0–100; the score is their weighted mean, less 15 for each day in the last two weeks the game was already shown. Values are illustrative.',
          pick: 'Dredge',
          terms: [
            { label: 'Affinity', weight: 35, value: 82 },
            { label: 'Similarity', weight: 20, value: 74 },
            { label: 'Quality', weight: 15, value: 68 },
            { label: 'Length fit', weight: 15, value: 60 },
            { label: 'Waiting', weight: 10, value: 91 },
            { label: 'Jitter', weight: 5, value: 12 },
          ],
        },
      },
      {
        n: 4,
        where: '/admin/radar',
        title: 'Watches for the next cartridge',
        claim:
          'Radar ranks upcoming physical releases and open pre-orders using the same taste profile, with a small bonus when a pre-order closes within 30 days.',
        why: {
          lead: 'Public rows carry public facts only:',
          text: 'title, platform, format, a registry date, a cover, and an IGDB link. Never a store, a price, stock, or a score.',
        },
        code: ['backend/radar.py'],
        live: {
          caption:
            'Coming soon and Further out. A date only appears when the community registry has one. A store’s date never counts.',
          empty: 'Nothing coming up yet.',
        },
        capture: {
          url: '/admin/radar',
          tag: 'signed in',
          note: 'score = 0.55 affinity + 0.35 similarity + 10 × hype, plus 15 when a pre-order closes within 30 days. Rows are illustrative.',
          columns: ['Lane', 'Game', 'Score', 'Pre-order', 'Answer'],
          rows: [
            [
              'pre-order',
              'Game D',
              '78 +15',
              { redacted: 'closes in 9 days' },
              { pill: 'Want', tone: 'acc' },
            ],
            ['dated', 'Game E', '71', '—', '—'],
            ['digital so far', 'Game F', '64', '—', 'Skip'],
          ],
        },
      },
      {
        n: 5,
        where: '/admin/discover',
        title: 'Suggests what to buy',
        claim:
          'Discover pre-scores released physical games on my platforms, then one Gemini call picks eight from the top twenty and writes the reasons. When the model can’t answer, the top eight by score fill in.',
        why: {
          lead: 'Why positions:',
          text: 'the model answers with positions in a list I built, never with titles. A model that returns titles can invent one; a model that returns positions can’t.',
        },
        code: ['backend/discover.py'],
        capture: {
          url: '/admin/discover',
          tag: 'signed in',
          note: 'Twenty pre-scored candidates, shuffled so their order doesn’t bias the model. Rows are illustrative.',
          columns: ['#', 'Candidate', 'Pre-score', 'Picked', 'Answer'],
          rows: [
            ['3', 'Game G', '81', { pill: 'yes', tone: 'acc' }, 'Want'],
            ['7', 'Game H', '77', { pill: 'yes', tone: 'acc' }, '—'],
            ['12', 'Game I', '69', 'no', '—'],
            ['15', 'Game J', '66', { pill: 'yes', tone: 'acc' }, 'Already own'],
          ],
        },
      },
      {
        n: 6,
        where: '/admin/store-list',
        title: 'Comes along to the store',
        claim:
          'The signed-in store list uses the same sections as What’s next, built by the same server function, with Got it, Want, and Not interested on every row so I can answer from the shop floor.',
        code: ['backend/next_list.py'],
      },
      {
        n: 7,
        where: 'nightly.yml',
        title: 'Rebuilds itself every night',
        claim:
          'At 00:17 UTC, a GitHub Actions job records the day’s picks, refreshes the registry and the stores, regenerates Radar (and Discover once a week), and redeploys the static site only when the snapshot has changed.',
        why: {
          lead: 'Why a job token:',
          text: 'it works only on a pinned list of routes, and a test fails if that list grows unnoticed.',
        },
        code: ['.github/workflows/nightly.yml'],
        capture: {
          url: 'nightly.yml',
          tag: 'GitHub Actions',
          note: 'Part of one run, in the job’s order. Timings are illustrative.',
          columns: ['Step', 'Result', 'Took'],
          rows: [
            ['picks', { pill: 'ok', tone: 'ok' }, '2 s'],
            ['registry', { pill: 'ok', tone: 'ok' }, '41 s'],
            ['stores', { pill: 'ok', tone: 'ok' }, '3 m 10 s'],
            ['resolve', { pill: 'ok', tone: 'ok' }, '12 s'],
            ['radar', { pill: 'ok', tone: 'ok' }, '6 s'],
            ['discover (weekly)', { pill: 'skipped' }, '—'],
            [
              'snapshot changed: deploy',
              { pill: 'ok', tone: 'ok' },
              '1 m 48 s',
            ],
          ],
        },
      },
      {
        n: 8,
        where: 'tests',
        title: 'Keeps the private parts private',
        claim:
          'A test pins exactly which keys a public row may carry and walks every response body for forbidden ones. Reasons are rebuilt from public games only, and a model’s sentence is published only when every game it cites is public.',
        code: ['backend/tests/test_public_outputs.py'],
        capture: {
          url: 'test_public_outputs.py',
          tag: 'pytest',
          note: 'A new key fails the test until it’s added to the allowlist on purpose.',
          code: [
            '# a public row is exactly these keys',
            'NEXT_ROW_FIELDS = {',
            '    "title", "platform", "physical_format", "release_date", "release_precision",',
            '    "cover_url", "igdb_url", "reasons", "top_pick", "new", "item_id",',
            '}',
            '# and no key anywhere in the body is one of these',
            'FORBIDDEN = {',
            '    "id", "score", "rank", "hypes", "lane", "store_lines", "format_note",',
            '    "model_note", "ranked_by", "based_on", "based_on_titles", "listing_ids",',
            '    "preorder_closes_at", "price", "store", "url", "status", "batch_id",',
            '}',
          ].join('\n'),
        },
      },
    ],
    closing: {
      longVersion: links.longVersion,
      source: { href: profile.repo, label: 'Source on GitHub' },
      shelf: { to: '/shelf', label: 'Back to the shelf' },
    },
  },
  status: {
    label: 'Status',
    refreshed: 'Last refreshed',
    fresh: 'refreshed in the last 36 hours',
    stale: 'not refreshed in over 36 hours',
    catalogue: 'Catalog',
    titles: 'titles',
    platforms: 'platforms',
    stores: 'Stores watched',
    listings: 'listings',
    picks: 'Picks',
    discover: 'Discover',
  },
  next: {
    path: '/shelf/next',
    title: 'What’s next',
    lede: 'What I could play tonight, and what I’m watching for in stores. Full cartridges only, ranked by what I’ve liked, rebuilt every night.',
    fresh: {
      picks: 'Picks',
      catalogue: 'Releases checked',
      discover: 'Suggestions',
    },
    sections: {
      tonight: 'Tonight',
      wanted: 'On my list',
      buy_now: 'In stores now',
      preorders: 'Coming soon',
      later: 'Further out',
      not_on_cartridge: 'Not on cartridge',
    },
    empty: {
      upNext: 'Nothing lined up for tonight.',
      picks: 'No picks yet — they’re rebuilt every night.',
      wanted: 'The list is empty, for now.',
      buy_now: 'Nothing in stores right now.',
      preorders: 'No cartridges due in the next 90 days.',
      later: 'Nothing announced further out.',
      not_on_cartridge: 'Nothing to skip.',
    },
    notOnCartridge: 'Digital only, or a Game-Key Card in a box. I skip these.',
    upNext: 'Up next',
    badges: { new: 'New', topPick: 'Top pick' },
    sorts: [
      { value: 'best', label: 'Best fit' },
      { value: 'newest', label: 'Newest' },
    ],
    sortLabel: 'Sort what’s in stores now',
    outOn: 'Out',
    /** As a meta line starts; mirrors FORMAT_WORDS in physical_sources/limits.py. */
    formats: {
      game_card: 'Full game on cartridge',
      game_key_card: 'Game-Key Card',
      code_in_box: 'Code in a box',
      disc: 'Disc',
    },
    digitalOnly: 'Digital only',
    formatUnknown: 'Format unknown',
    otherPlatform: 'Other',
    attribution: { before: 'Game data from', label: 'IGDB', after: '.' },
    band: {
      lead: 'What’s next',
      tonight: 'Tonight:',
      toBuy: 'in stores',
      preorders: 'coming soon',
    },
    loading: 'Loading…',
    waking: WAKING,
    error: LOAD_ERROR,
  },
  /** /admin/store-list: What's next's sections with my answers on them. */
  storeList: {
    title: 'Store list',
    signIn: 'to see the store list.',
    note: 'On a Switch 2 box, look for the Game-Key Card label and put those back.',
    loading: 'Loading the list…',
    empty: {
      before: 'Nothing to look for yet. Generate',
      and: 'and',
      after: 'first.',
    },
    answers: {
      own: 'Got it',
      want: 'Want',
      dismiss: 'Not interested',
    },
    answered: {
      own: (title) => `Added ${title} to the collection`,
      want: (title) => `Added ${title} to my list`,
      dismiss: (title) => `Dropped ${title}`,
    },
  },
}
