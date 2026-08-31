/**
 * Static profile content for the site.
 *
 * This is the single source of truth for personal facts. Pages read from here
 * rather than holding copy inline, so that a future move to a dynamic source
 * changes only this module and leaves page components untouched.
 *
 * `bio` is filled in Task 7 with Joey's own prose. `linkedin` stays null until
 * the real URL is confirmed; the footer omits the link when it is null.
 */
export const profile = {
  name: 'Joey Haas',
  tagline: 'Software developer — Denver, CO',
  bio: '',
  email: 'josephthaas@gmail.com',
  github: 'https://github.com/joeyh92989',
  linkedin: null,
}
