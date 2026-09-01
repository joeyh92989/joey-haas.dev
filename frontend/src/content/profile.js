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
  tagline: 'Software developer in Denver, Colorado',
  bio: `I'm a backend engineer at Guild Education in Denver, where I've gone from SE1 to senior working on transaction services, tax classification, and the company-wide platform migrations that quietly hold a benefits business together. Node.js and TypeScript mostly, with the distributed-systems problems that come attached.

Before that I spent nine years as a product manager across enterprise SaaS, payments, and video platforms. That's why I care as much about why we're building something as how it gets built — and why I'm comfortable owning work end to end, from scoping and requirements through implementation and the production monitoring that tells you whether any of it worked.`,
  email: 'josephthaas@gmail.com',
  github: 'https://github.com/joeyh92989',
  linkedin: 'https://www.linkedin.com/in/haasjoseph/',
  /** Rendered as the About page's chip row, in this order. */
  toolbox: [
    'Node.js',
    'TypeScript',
    'Python · FastAPI',
    'React',
    'REST APIs',
    'Data pipelines',
    'Distributed systems',
  ],
}
