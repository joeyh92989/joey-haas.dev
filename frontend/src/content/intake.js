import { spine } from './spine.js'

/** The display name of each source a recording can name. */
const SOURCE_NAMES = {
  tmdb: 'TMDB',
  igdb: 'IGDB',
  comicvine: 'Comic Vine',
  bgg: 'BoardGameGeek',
}

/** "TMDB", "TMDB and IGDB", "TMDB, IGDB and Comic Vine". */
function sourceList(sources) {
  const names = sources.map((key) => SOURCE_NAMES[key] ?? key)
  if (names.length < 2) return names[0] ?? 'the sources'
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/**
 * Every word on /shelf/intake, the public intake demo (intake spec, "Demo
 * page"). The recording it replays is `content/intakeDemo.js`; this is only
 * what the page says.
 */
export const intake = {
  path: '/shelf/intake',
  title: 'Try the intake',
  headTitle: `Try the intake · ${spine.name}`,
  description:
    'The pipeline every title on my shelf came through, replayed on a recorded shelf photo: read, matched, reviewed, added. No model is called and nothing is saved.',
  lede: 'Everything on my shelf got there through one pipeline: photograph it or search for it, let the sources match it, confirm, add. This is that pipeline on a recorded shelf. No model is called and nothing is saved.',
  notRecorded:
    'The recording isn’t in yet: one real shelf photo, read and matched once, replayed here. Until then there’s nothing to show.',
  shelfLabel: (titles) =>
    `A shelf of ${titles.length} spines: ${titles.join(', ')}`,
  stagesLabel: 'Stages',
  stages: (sources) => [
    { key: 'read', name: 'Read', line: 'a model reads the spines' },
    {
      key: 'match',
      name: 'Match',
      line: `titles looked up in ${sourceList(sources)}`,
    },
    { key: 'review', name: 'Review', line: 'a person confirms' },
    { key: 'add', name: 'Add', line: 'rows written, private' },
  ],
  /** Hidden text after a stage's name, for its state. */
  stageState: { done: 'done', now: 'now', waiting: 'not yet' },
  buttons: {
    read: 'Read this shelf',
    search: 'Search instead',
    over: 'Start over',
    add: (n) => `Add ${n} (pretend)`,
  },
  searchNote:
    'Search asks the live sources, so it isn’t part of this recording. Signed in, one search box asks every source at once and adds through the same review.',
  empty: 'Nothing read yet. Press “Read this shelf”.',
  reading: 'Reading the spines…',
  matching: 'Matching the titles…',
  timing: (stages, recordedOn) =>
    `Recorded ${recordedOn}: read in ${seconds(stages.read_ms)}, matched in ${seconds(stages.match_ms)}.`,
  counts: ({ read, exact, probable, check }) =>
    `${read} read · ${exact} exact · ${probable} probable · ${check} to check`,
  added: (n) =>
    `Pretend: nothing was written. On my shelf these ${n} would now be private rows, waiting to be published.`,
  rack: 'The same four stages take a rack of clothes: one photo per piece, a tagger instead of a catalog, the same review and the same commit.',
  how: { to: '/shelf/how', label: 'How it is built' },
  fine: 'Confidence is computed from string distance between what was read and what the source returned. The model never grades itself.',
}

/** "8.2 s" from milliseconds. */
function seconds(ms) {
  return `${(Number(ms) / 1000).toFixed(1)} s`
}
