/**
 * Work history for the About page timeline, newest first.
 *
 * Entries are grouped by employer rather than by role: a promotion inside one
 * company is a single arrow-joined entry, which keeps the timeline readable at
 * the width of the page. `current: true` marks the present role — About uses it
 * to pick the accent dot color, so exactly one entry should carry it.
 *
 * @typedef {object} ExperienceEntry
 * @property {string} role Title, or `earlier → later` for a promotion.
 * @property {string} company Employer name.
 * @property {string} meta Dates and location, rendered in uppercase.
 * @property {string} summary One sentence on the work.
 * @property {boolean} [current] True for the present role.
 *
 * @type {ExperienceEntry[]}
 */
export const experience = [
  {
    role: 'Software Engineer I → Sr. Software Engineer',
    company: 'Guild (formerly Guild Education)',
    meta: '2021 – present · Denver, CO',
    summary:
      'Spend-writing APIs, funding context, tax classification, and the eligibility migration underneath them — owned from API contract through rollout and incident forensics.',
    current: true,
  },
  {
    role: 'Product Manager, Payment Products',
    company: 'Guild (formerly Guild Education)',
    meta: '2020 – 2021 · Denver, CO',
    summary:
      'Balance tracking and external benefits administration for Fortune 1000 employer partners.',
  },
  {
    role: 'Software Product Manager, Core Services',
    company: 'MJ Freeway',
    meta: '2018 – 2019 · Denver, CO',
    summary:
      'Product owner for the core suite — cultivation, processing, and point of sale — on a two-to-three-week release cadence.',
  },
  {
    role: 'Manager, Video Products',
    company: 'Charter Communications',
    meta: '2014 – 2018 · Denver, CO',
    summary:
      'Roadmap and backlog for three set-top video guide products and their cross-platform features, including accessibility compliance.',
  },
  {
    role: 'Associate Product Manager, IPTV Platform',
    company: 'iBAHN',
    meta: '2012 – 2014 · Denver, CO',
    summary:
      'In-room hospitality video platform for Marriott, Hilton, and Four Seasons properties.',
  },
]
