import { spine } from './spine.js'

/**
 * Every word on /daily, the daily game, code name Shelfle (daily puzzle spec). Grading
 * rules live in lib/daily.js; this is only what the page says.
 */
export const daily = {
  path: '/daily',
  name: 'Daily game',
  title: 'Daily game',
  /** The one line under the shelf's hero numbers. */
  entry: 'Today’s daily game →',
  headTitle: `Daily game · ${spine.name}`,
  description:
    'One small game a day, built from what is on my shelf: guess the game in six, each guess graded on platform, year, genre and size. The same puzzle for everyone, new at midnight Denver time, no account.',
  lede: 'One small game a day, built from what’s on the shelf. Same puzzle for everyone, new at midnight Denver time, no account.',
  hint: 'Guess the game on my shelf in six. Each guess shows how close its platform, year, genre and size are.',
  /** Column headers, in board order. */
  columns: {
    title: 'Guess',
    platform: 'Platform',
    year: 'Year',
    genre: 'Genre',
    size: 'Size',
  },
  /** The three looks, as the legend and the hidden cell text say them. */
  states: { match: 'match', close: 'close', no: 'no' },
  legend: {
    match: 'match',
    close: 'close (the arrow says which way)',
    no: 'no',
  },
  board: {
    caption: (made, max) => `${made} of ${max} guesses`,
    emptyRow: 'Empty',
  },
  input: {
    label: 'Your guess',
    placeholder: 'Type a game',
    suggestions: 'Titles on the shelf',
    notOnShelf: 'Not on the shelf.',
    alreadyGuessed: (title) => `Already guessed ${title}.`,
    count: (next, max) => `Guess ${next} of ${max}`,
  },
  stats: { streak: 'Streak', played: 'Played', average: 'Avg guesses' },
  result: {
    gotIt: (guesses) => `Got it in ${guesses}.`,
    notToday: (title) => `Not today. It was ${title}.`,
    hours: (hours) => `about ${hours} h to finish`,
    share: 'Share',
    onShelf: 'See it on the shelf',
  },
  share: {
    title: 'Share today’s result',
    copy: 'Copy',
    copied: 'Copied.',
    close: 'Close',
    blocked: 'Copying is blocked here. Select the text and copy it yourself.',
    words: 'As words, one line per guess:',
  },
  yesterday: 'Yesterday’s answer:',
  soon: (date) =>
    `The first daily game opens on ${date}, at midnight Denver time.`,
  empty:
    'No puzzle today. The shelf snapshot is missing, so there is nothing to guess from.',
  announce: {
    graded: (guess, title) => `Guess ${guess}, ${title}, graded.`,
    won: (guesses) => `Solved in ${guesses}.`,
    lost: (title) => `Out of guesses. The answer was ${title}.`,
  },
}
