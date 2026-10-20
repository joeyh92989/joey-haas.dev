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

export const LOAD_ERROR = 'That didn’t load. Try again in a minute.'

export const ACTION_ERROR = 'Couldn’t reach the server. Try again in a minute.'
