import { describe, expect, it } from 'vitest'
import { intake } from './intake.js'
import { projects } from './projects.js'

describe('projects', () => {
  it('links the intake demo from the My Shelf card, after How it works', () => {
    const labels = projects[0].links.map((link) => link.label)
    expect(projects[0].links).toContainEqual({
      to: '/shelf/intake',
      label: intake.title,
    })
    expect(labels.indexOf(intake.title)).toBe(labels.indexOf('Tour') + 1)
  })
})
