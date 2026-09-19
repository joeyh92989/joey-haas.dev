/**
 * Static profile content for the site.
 *
 * This is the single source of truth for personal facts. Pages read from here
 * rather than holding copy inline, so that a future move to a dynamic source
 * changes only this module and leaves page components untouched.
 *
 * Bio paragraphs are separated by a blank line; About.jsx splits on '\n\n'.
 * Work history lives in experience.js.
 */
export const profile = {
  name: 'Joey Haas',
  tagline: 'Senior software engineer · Denver, Colorado',
  bio: `I'm a senior software engineer at Guild, where five years of engineering on the payments team have gone into the backend systems that fund, track, and reconcile every learner benefit dollar — spend-writing APIs, funding context, tax classification, and the eligibility migration underneath them.

Before the code, eight years as a product manager across enterprise SaaS, payments, and video. I still work like one: architecture doc, then squad alignment, then the endpoint — and the data forensics when something goes wrong. Most useful on systems where correctness and money are the same problem.`,
  email: 'josephthaas@gmail.com',
  github: 'https://github.com/joeyh92989',
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
    'Mocha · Chai · Sinon',
    'Integration testing · BDD',
    'Snyk',
    'Salesforce · NetSuite',
    'GitHub Actions CI',
  ],
}
