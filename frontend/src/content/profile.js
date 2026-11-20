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
    lead: 'Building software since 2012, as a product manager first and an engineer',
    accent: 'since 2021.',
  },
  lede: 'I’m a senior software engineer at Guild, building the payments and ledger systems behind employer-funded education. I spent eight years as a product manager before that, so I care as much about why we build things as how.',
  /** Home's facts table, after which the derived Last shipped and Playing rows. */
  facts: [
    { label: 'Now', value: 'Guild · Senior Software Engineer' },
    { label: 'Focus', value: 'Payments & ledger systems' },
    { label: 'Stack', value: 'Node · TypeScript · Python · Postgres' },
  ],
  bio: `Senior software engineer with 5 years of experience building production systems for payments and ledger platforms that fund, track, and reconcile $1B annually in benefits for Fortune 1000 employer partners and 3.37M learners, plus 8 years of experience as a product manager shipping enterprise software. Specializing in financial systems, combining API design, distributed architecture, and cross-functional delivery to bridge engineering, product, and operations.`,
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
    'Backend & API Design',
    'Payments & Ledger Systems',
    'Distributed Systems',
    'Event-Driven Architecture',
    'Data Modeling & Database Design',
    'Data Migrations & Backfills',
    'System Architecture & ADRs',
    'Observability & Alerting',
    'Incident Response & Forensics',
    'Performance & Load Testing',
    'Security Remediation',
    'B2B & Benefits Integration',
    'Product Strategy & Roadmaps',
    'Agile, BDD & SAFe Delivery',
    'Technical Documentation & Runbooks',
  ],
  /**
   * Rendered as the About page's chip row, in this order: the technical
   * skills line, split at its top-level commas. A parenthetical stays with
   * its chip, and "Salesforce, NetSuite, and Stripe integrations" is one
   * chip because the line reads it as one phrase ("integrations" belongs to
   * all three), so no chip drops or adds a word.
   */
  toolbox: [
    'TypeScript',
    'Python',
    'Node.js',
    'JavaScript',
    'SQL',
    'PostgreSQL',
    'Snowflake',
    'REST API development',
    'GraphQL (AWS AppSync)',
    'event-driven architecture',
    'AWS (Lambda, SQS, Kinesis, EventBridge, AppSync, RDS/Aurora, CDK)',
    'Terraform',
    'containerization',
    'Git',
    'GitHub Actions (CI/CD)',
    'Datadog',
    'Mocha/Chai/Sinon',
    'integration testing',
    'BDD',
    'Snyk',
    'Salesforce, NetSuite, and Stripe integrations',
    'Jira',
    'Confluence',
  ],
}
