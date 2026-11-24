import { daily } from '../content/daily.js'

/**
 * The pages under the masthead's More: one list that feeds the desktop panel
 * (MoreMenu) and the phone sheet's More group, so they cannot drift apart.
 *
 * Each item: `to`, `label`, `desc` (the second line in the panel),
 * `sheetLabel` (the phone sheet's row, when it reads differently) and
 * `underlinesMore: false` for a page More should not take the underline for.
 * Daily game is a My Shelf tab (My Shelf owns /daily), so on it My Shelf
 * keeps the underline and More does not.
 *
 * TIL shows only while a note is published (`hasNotes`), the same rule as
 * the footer.
 *
 * @param {{hasNotes?: boolean}} [flags]
 * @returns {{to: string, label: string, desc: string, sheetLabel?: string,
 *   underlinesMore?: boolean}[]}
 */
export function moreItems({ hasNotes = false } = {}) {
  return [
    {
      to: '/now',
      label: 'Now',
      desc: 'What I am playing and what is next',
    },
    {
      to: '/stats',
      label: 'Stats',
      desc: 'Views and visitors, counted by the site',
    },
    ...(hasNotes
      ? [{ to: '/til', label: 'TIL', desc: 'Short notes on things I learned' }]
      : []),
    {
      to: daily.path,
      label: 'Daily game',
      desc: 'One small game a day',
      underlinesMore: false,
    },
    {
      to: '/colophon',
      label: 'Colophon',
      desc: 'How this site is built',
    },
  ]
}

/**
 * Whether a pathname is a nav item's page or nested under it.
 *
 * @param {string} pathname
 * @param {string} to
 */
export function isUnder(pathname, to) {
  const path = pathname.replace(/\/+$/, '') || '/'
  return path === to || path.startsWith(`${to}/`)
}
