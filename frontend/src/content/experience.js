/**
 * Work history for the About page timeline, newest first.
 *
 * Entries are grouped by employer. An employer with one role carries
 * `bullets` and renders as one entry; an employer with several carries a
 * `blurb` and `roles` (newest first), and About nests the roles under its
 * name. Exactly one of `bullets` or `roles` is set per entry, and exactly one
 * role or entry across the list carries `current`, which About gives the
 * accent dot. experience.test.js holds both rules.
 *
 * Home's shorter list reads `short`, `companyShort`, `earlier` and
 * `homeRows` only (see homeExperience): it shows neither roles nor bullets.
 *
 * @typedef {object} ExperienceRole
 * @property {string} title Role title.
 * @property {string} dates Dates in the site's meta style: "2022 – 2024".
 * @property {string[]} bullets What the role did; never empty.
 * @property {boolean} [current] True for the present role.
 *
 * @typedef {object} HomeRow
 * @property {string} role Title Home shows after the company.
 * @property {string} dates Dates Home shows.
 * @property {string} short A clause for Home's shorter list.
 *
 * @typedef {object} ExperienceEntry
 * @property {string} [role] Title of a one-role employer's entry.
 * @property {string} company Employer name.
 * @property {string} meta Dates, then ` · ` and the location.
 * @property {string} [blurb] One paragraph on an employer with several roles.
 * @property {string[]} [bullets] A one-role employer's bullets.
 * @property {ExperienceRole[]} [roles] A multi-role employer's roles.
 * @property {HomeRow[]} [homeRows] Home's rows for an employer with roles.
 * @property {string} [short] A clause for Home's shorter list.
 * @property {string} [companyShort] The name Home uses, when shorter.
 * @property {boolean} [current] True for a one-role employer's present role.
 * @property {boolean} [earlier] Folded into one row on Home.
 *
 * @type {ExperienceEntry[]}
 */
export const experience = [
  {
    company: 'Guild',
    meta: '2020 – present · Denver, CO',
    blurb:
      'Education and career-mobility benefits platform serving Fortune 1000 employers. The payments engineering team owns the systems that fund, track, and reconcile $1B annually in benefits for 3.37M learners. Owned the team’s core funding service continuously since 2021.',
    roles: [
      {
        title: 'Senior Software Engineer',
        dates: 'Oct 2024 – present',
        current: true,
        bullets: [
          'Led the migration of the legacy ledger service to a new eligibility platform. Defined the API contract, implemented the solution, and logged traffic.',
          'Designed a replayable spend ledger to replace the legacy ledger service, merging pending and posted transactions into one record per member. Built the backfill engine that loaded 3.84M historical rows in production.',
          'Created the funding-position service, a system that computes user benefit utilization from various events through Guild’s systems, supporting both frontend and backend systems.',
          'Built a bulk balance endpoint handling up to 500 accounts per call, replacing thousands of individual requests. Cut mean latency 55–74% and raised throughput 2–4× in production, backed by automated load tests.',
          'Reduced cost and failed deploys by retiring unused Aurora PostgreSQL clusters and rebuilding deploy and test workflows and Lambda/SQS failure handling; added metric-based alerting and runbooks for failures.',
          'Built an AI agent skill that supports the on-call rotation by allowing secure corrections to the financial ledger without a code change.',
        ],
      },
      {
        title: 'Software Engineer II',
        dates: '2022 – 2024',
        bullets: [
          'Architected and implemented createSpend, the single write path behind $1B in annual spend, with unified request and response models, idempotency safeguards, and deterministic data ingestion.',
          'Built the funding-context service that validates each transaction entering the ledger against employer policy and benefit configuration at runtime.',
          'Implemented the data system behind employer tax reporting: backfilled tax data across Stripe, NetSuite, and reimbursement systems (one run covering 50K+ learners) with IRS tax section and gross-up treatment.',
        ],
      },
      {
        title: 'Software Engineer I',
        dates: '2021 – 2022',
        bullets: [
          'Delivered cross-year refund logic by ingesting transaction events from Salesforce CRM to prevent employer over- and underpayments.',
          'Extended the transaction database GraphQL API with filtering, pagination, bulk updates, audit fields, and tax-period endpoints, and integrated it into the company’s federated gateway.',
        ],
      },
      {
        title: 'Product Manager, Payment Products',
        dates: '2020 – 2021',
        bullets: [
          'Owned balance-tracking and external benefits administration products for cross-functional payments scrum teams, supporting Fortune 1000 employer partners and the systems that determine how each learner’s benefit dollars are funded and reconciled.',
          'Wrote detailed user stories and frontend mockups, defined MVPs, and prioritized the backlog.',
          'Coordinated multi-team projects with fellow product managers and engineering leaders, aligning requirements, deployment sequencing, and cross-squad dependencies for releases spanning several services.',
        ],
      },
    ],
    // Home keeps its two Guild rows and their live clauses; they are not
    // derived from the roles above.
    homeRows: [
      {
        role: 'Software Engineer I → II → Senior',
        dates: '2021 – present',
        short:
          'Owned the APIs that record benefit spending and led the ledger’s move to a new eligibility platform.',
      },
      {
        role: 'Product Manager, Payment Products',
        dates: '2020 – 2021',
        short:
          'Balance tracking and external-benefits administration for Fortune 1000 customers.',
      },
    ],
  },
  {
    role: 'Software Product Manager, Core Services',
    company: 'MJ Freeway',
    meta: '2018 – 2019 · Denver, CO',
    bullets: [
      'Served as product owner for the Core Services suite (Cultivation, Processing, and Point of Sale). Defined the end-to-end enterprise development strategy using the SAFe framework and maintained a two-week release cadence.',
      'Created requirements, user stories, wireframes, and UI mockups; collaborated with enterprise clients to validate roadmap milestones and reduce refactoring.',
      'Trained the product organization on SDLC practices, from writing bug reports and user stories to identifying core customer needs.',
    ],
    short: 'core-suite product owner',
    earlier: true,
  },
  {
    role: 'Manager, Video Products',
    company: 'Charter Communications',
    meta: '2014 – 2018 · Denver, CO',
    bullets: [
      'Defined the roadmap and owned the backlog for three TiVo set-top video guide products supporting 20% of enterprise video customers. Managed features across set-top boxes, Roku, Xbox, Samsung, web, and mobile platforms.',
      'Served as feature owner for accessibility compliance, partnering with UX to deliver a text-to-speech guide usable without vision, on a preinstalled Samsung tablet app, and a web portal with cloud DVR.',
      'Won the Charter Champion Award (2015) for rebuilding internal and customer-facing support tools with the Care team, reducing call handling time and adding self-service options.',
    ],
    short: 'set-top video guides',
    companyShort: 'Charter',
    earlier: true,
  },
  {
    role: 'Associate Product Manager, IPTV Platform / Hospitality Public PC Solutions',
    company: 'iBAHN',
    meta: '2012 – 2014 · Denver, CO',
    bullets: [
      'Managed the in-room video platform for hotels, including custom set-top hardware, live TV and on-demand interfaces, and room-control integrations. Led marketing, business development, and global product development for a public-PC product for hotel lobbies and business centers.',
      'Gathered requirements for large clients, including Marriott, Hilton, and Four Seasons; translated customer issues into feature requirements and improvements to support error handling.',
      'Analyzed market trends and competitor data to identify product gaps.',
    ],
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
  const rows = recent.flatMap((entry) =>
    (
      entry.homeRows ?? [
        { role: entry.role, dates: datesOf(entry), short: entry.short },
      ]
    ).map((row) => ({
      key: `${entry.company}-${row.role}`,
      dates: row.dates,
      title: `${entry.company} — ${row.role}`,
      summary: row.short,
    })),
  )
  if (earlier.length === 0) return rows
  const end = datesOf(earlier[0]).split(' – ').pop()
  const start = datesOf(earlier.at(-1)).split(' – ')[0]
  const summary = earlier.map((entry) => entry.short).join('; ')
  rows.push({
    key: 'earlier',
    dates: `${start} – ${end}`,
    title: `${earlier.map((entry) => entry.companyShort ?? entry.company).join(' · ')} — Product management`,
    summary: `${summary[0].toUpperCase()}${summary.slice(1)}.`,
  })
  return rows
}
