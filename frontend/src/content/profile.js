/**
 * Static profile content for the site.
 *
 * This is the single source of truth for personal facts. Pages read from here
 * rather than holding copy inline, so that a future move to a dynamic source
 * changes only this module and leaves page components untouched.
 *
 * Bio paragraphs are separated by a blank line; About.jsx splits on '\n\n'.
 * Work history lives in experience.js.
 *
 * `headline` is Home's hero and the only place its claim is made; About
 * opens with the bio instead, so the two pages do not start on one line.
 * `accent` is the headline's closing phrase, set in the serif italic.
 */
export const profile = {
  name: 'Joey Haas',
  tagline: 'Senior software engineer · Denver, Colorado',
  headline: {
    lead: 'Backend systems where correctness and money are the',
    accent: 'same problem.',
  },
  lede: 'I’m a senior software engineer at Guild, building the payments and ledger systems behind employer-funded education. I spent eight years as a product manager before that, so I care as much about why we build things as how.',
  /** Home's facts table, after which the derived Last shipped and Playing rows. */
  facts: [
    { label: 'Now', value: 'Guild · Senior Software Engineer' },
    { label: 'Focus', value: 'Payments & ledger systems' },
    { label: 'Stack', value: 'Node · TypeScript · Python · Postgres' },
  ],
  bio: `I’m a senior software engineer at Guild, on the payments team. For five years I’ve built the backend that funds, tracks, and reconciles education benefits for enterprise employers: the APIs that record spending, the ledger behind them, the tax rules on top, and one service’s side of a company-wide migration to a new eligibility platform.

Before the code, I spent eight years as a product manager across enterprise SaaS, payments, and video. I still work like one: architecture doc first, then team alignment, then the endpoint, and the data forensics when something goes wrong.`,
  location: 'Denver, Colorado',
  /** About's key/value list, above the résumé link. */
  aboutFacts: [
    { label: 'Role', value: 'Senior Software Engineer' },
    { label: 'Company', value: 'Guild' },
    { label: 'Engineering', value: '5 years' },
    { label: 'Product', value: '8 years' },
  ],
  email: 'josephthaas@gmail.com',
  github: 'https://github.com/joeyh92989',
  /** This site's repository: the footer, Projects and /spine link to it. */
  repo: 'https://github.com/joeyh92989/joey-haas.dev',
  linkedin: 'https://www.linkedin.com/in/haasjoseph/',
  /**
   * Rendered as the About page's Areas of expertise list, in this order.
   *
   * These describe work, not tooling — the toolbox chips below carry the
   * tools. An entry belongs in exactly one of the two lists, because both
   * are asserted with an exact-text query that throws on a duplicate.
   */
  expertise: [
    'Backend & API design',
    'Payments & ledger systems',
    'Distributed systems',
    'Event-driven architecture',
    'Data modeling & database design',
    'Data migrations & backfills',
    'System architecture & ADRs',
    'Observability, alerting & incident forensics',
  ],
  /** Rendered as the About page's chip row, in this order. */
  toolbox: [
    'Node.js',
    'TypeScript',
    'Python · FastAPI',
    'React',
    'SQL · PostgreSQL',
    'Snowflake',
    'GraphQL (AppSync)',
    'AWS (Lambda, RDS)',
    'REST API design',
    'Testing · Mocha, Chai, BDD',
    'Salesforce · NetSuite',
    'GitHub Actions CI',
  ],
}
