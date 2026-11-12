/**
 * The site's words for a sleeping or unreachable API.
 *
 * The backend runs on Render's free tier and sleeps when idle, so every page
 * that calls it can catch it waking or failing. One wording for that, shared
 * by the public and admin pages alike, so the site never says it three ways.
 * `LOAD_ERROR` is for a page or section that failed to load; `ACTION_ERROR`
 * is for something the visitor pressed. A message that names its action
 * ("Could not get picks") stays with its page.
 */
export const WAKING =
  'Waking the server — it sleeps when idle, so this can take up to a minute.'

/**
 * A first load that may be a waking server or a model call, which take
 * about as long: Closet's Today, whose first read can plan the day.
 */
export const WAKING_OR_PLANNING = 'Waking the server or planning the day'

/** Shown beside `WAKING_OR_PLANNING` once Today has waited a while. */
export const STILL_PLANNING =
  'Still working — planning asks the model and can take up to two minutes.'

/** Today's failure when the wait passes its deadline. */
export const PLANNING_TIMEOUT = "Planning didn't answer in time. Try again."

/** Tag now's wait: one batch of the queue, `count` photos long. */
export const taggingWait = (count) =>
  `Tagging ${count} ${count === 1 ? 'photo' : 'photos'} — one batch`

/** Shown beside `taggingWait` once Tag now has waited a while. */
export const STILL_TAGGING = 'Still working — this can take up to two minutes.'

/** Tag now's failure when the wait passes its deadline. */
export const TAGGING_TIMEOUT =
  "Tagging didn't answer in time. It may still finish — reload to see."

/** A photo waiting for the reader: how many are read before it. */
export const photoQueued = (ahead) =>
  ahead > 0
    ? `waiting to be read · ${ahead} ahead`
    : 'waiting to be read · next'

/** The photo being read, `seconds` into the model call. */
export const photoReading = (seconds) => `reading · ${seconds} s`

/** Shown beside `photoReading` once a read has gone on a while. */
export const STILL_READING =
  'still reading — the model can take a minute or two'

/** The reader's failure when a read passes its deadline. */
export const READER_TIMEOUT = "The reader didn't answer in time; try again."

export const LOAD_ERROR = 'That didn’t load. Try again in a minute.'

export const ACTION_ERROR = 'Couldn’t reach the server. Try again in a minute.'

/** The label on the button that re-runs a failed read. */
export const TRY_AGAIN = 'Try again'

/** A signed-in action that finds the session gone. */
export const SESSION_ENDED = 'Your session ended. Sign in again.'

/** Beside Try again when a live refresh failed but an older copy is showing. */
export const STALE_COPY = 'Showing the last saved copy.'

/** Beside Try again when a refresh of live data failed; what is shown is older. */
export const REFRESH_FAILED = 'Couldn’t refresh. Showing what was here before.'

/** An owner's change went through, but re-reading the page afterwards failed. */
export const SAVED_NOT_REFRESHED =
  'Saved, but couldn’t refresh the page. Try again to see it.'

/** The play diary is a separate read; this is its failure, not "no sessions". */
export const DIARY_FAILED = 'Couldn’t load the play diary.'
