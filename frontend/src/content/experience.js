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
 * @property {string} meta Dates, then ` · ` and the location.
 * @property {string} summary One sentence on the work.
 * @property {string} short A clause for Home's shorter list.
 * @property {string} [companyShort] The name Home uses, when shorter.
 * @property {boolean} [current] True for the present role.
 * @property {boolean} [earlier] Folded into one row on Home.
 *
 * @type {ExperienceEntry[]}
 */
export const experience = [
  {
    role: 'Software Engineer I → II → Senior',
    company: 'Guild',
    meta: '2021 – present · Denver, CO',
    summary:
      'Owned the spend-writing APIs and the eligibility-platform migration end to end — API contract, rollout, alerting, and the incident forensics after.',
    short:
      'Owned the APIs that record benefit spending, and the funding side of a company-wide eligibility migration.',
    current: true,
  },
  {
    role: 'Product Manager, Payment Products',
    company: 'Guild',
    meta: '2020 – 2021 · Denver, CO',
    summary:
      'Balance tracking and external benefits administration for Fortune 1000 employer partners.',
    short:
      'Balance tracking and external-benefits administration for Fortune 1000 customers.',
  },
  {
    role: 'Software Product Manager, Core Services',
    company: 'MJ Freeway',
    meta: '2018 – 2019 · Denver, CO',
    summary:
      'Product owner for the core suite — cultivation, processing, and point of sale — on a two-to-three-week release cadence.',
    short: 'core-suite product owner',
    earlier: true,
  },
  {
    role: 'Manager, Video Products',
    company: 'Charter Communications',
    meta: '2014 – 2018 · Denver, CO',
    summary:
      'Roadmap and backlog for three set-top video guide products and their cross-platform features, including accessibility compliance.',
    short: 'set-top video guides',
    companyShort: 'Charter',
    earlier: true,
  },
  {
    role: 'Associate Product Manager, IPTV Platform',
    company: 'iBAHN',
    meta: '2012 – 2014 · Denver, CO',
    summary:
      'In-room hospitality video platform for Marriott, Hilton, and Four Seasons properties.',
    short: 'in-room hospitality video',
    earlier: true,
  },
]

/** The dates half of an entry's `meta`: "2021 – present". */
function datesOf(entry) {
  return entry.meta.split(' · ')[0]
}

/**
 * Home's shorter work history: one row per recent role, and the `earlier`
 * roles folded into one row that spans their years. About lists them all.
 *
 * @param {ExperienceEntry[]} [entries] Newest first.
 * @returns {{key: string, dates: string, title: string, summary: string}[]}
 */
export function homeExperience(entries = experience) {
  const recent = entries.filter((entry) => !entry.earlier)
  const earlier = entries.filter((entry) => entry.earlier)
  const rows = recent.map((entry) => ({
    key: `${entry.company}-${entry.role}`,
    dates: datesOf(entry),
    title: `${entry.company} — ${entry.role}`,
    summary: entry.short,
  }))
  if (earlier.length === 0) return rows
  const end = datesOf(earlier[0]).split(' – ').pop()
  const start = datesOf(earlier.at(-1)).split(' – ')[0]
  const summary = earlier.map((entry) => entry.short).join('; ')
  rows.push({
    key: 'earlier',
    dates: `${start} – ${end}`,
    title: `${earlier.map((entry) => entry.companyShort ?? entry.company).join(' · ')} — Product`,
    summary: `${summary[0].toUpperCase()}${summary.slice(1)}.`,
  })
  return rows
}
