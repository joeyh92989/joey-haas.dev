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
  'Waking the server — it sleeps when idle, so this takes about thirty seconds.'

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

export const LOAD_ERROR = 'That didn’t load. Try again in a minute.'

export const ACTION_ERROR = 'Couldn’t reach the server. Try again in a minute.'
