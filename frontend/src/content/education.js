/**
 * Schooling and certifications for the About page, newest first.
 *
 * Separate from experience.js because the shape differs — a credential has an
 * issuing school rather than a role and an employer — even though both render
 * through the same timeline markup.
 *
 * @typedef {object} EducationEntry
 * @property {string} credential Program or degree earned.
 * @property {string} school Issuing institution.
 * @property {string} meta Year and location, rendered in uppercase.
 *
 * @type {EducationEntry[]}
 */
export const education = [
  {
    credential: 'Back-End Engineering Program',
    school: 'Turing School of Software and Design',
    meta: '2021 · Remote',
  },
  {
    credential: 'B.S. International Business, minor in Marketing',
    school: 'University of Denver',
    meta: '2012 · Denver, CO',
  },
]

/** Rendered as a chip row beneath the education timeline, in this order. */
export const certifications = [
  'Certified Scrum Product Owner',
  'Pragmatic Marketing Certified',
]
