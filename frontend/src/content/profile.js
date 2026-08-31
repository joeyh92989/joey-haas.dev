/**
 * Static profile content for the site.
 *
 * This is the single source of truth for personal facts. Pages read from here
 * rather than holding copy inline, so that a future move to a dynamic source
 * changes only this module and leaves page components untouched.
 *
 * Bio paragraphs are separated by a blank line; About.jsx splits on '\n\n'.
 */
export const profile = {
  name: 'Joey Haas',
  tagline: 'Software developer — Denver, CO',
  bio: `Senior Software Engineer with 4+ years building distributed backend services, APIs, and data pipelines in Node.js and TypeScript, preceded by 8+ years as a product manager across enterprise SaaS, payments, and video platforms. That product background shapes how I approach engineering — I think about the "why" as much as the "how," and I'm comfortable owning work from scoping and requirements through implementation and production monitoring.

Currently at Guild Education, where I've progressed from SE1 to Senior Engineer working on transaction services, tax classification systems, and company-wide platform migrations. I like hard problems at the intersection of complex business logic and clean system design.`,
  email: 'josephthaas@gmail.com',
  github: 'https://github.com/joeyh92989',
  linkedin: 'https://www.linkedin.com/in/haasjoseph/',
}
