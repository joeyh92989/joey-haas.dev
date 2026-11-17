import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { awards, certifications, education } from '../content/education.js'
import { experience } from '../content/experience.js'
import { profile } from '../content/profile.js'
import About from './About.jsx'

describe('About', () => {
  it('renders each bio paragraph from the profile module', () => {
    render(<About />)
    for (const paragraph of profile.bio.split('\n\n').filter(Boolean)) {
      expect(screen.getByText(paragraph)).toBeInTheDocument()
    }
  })

  // An employer holds either bullets (one role) or roles (several); this
  // reads whichever the content has, so it stays true as the content changes.
  it('renders every employer, role and bullet from the content', () => {
    render(<About />)
    expect(experience.length).toBeGreaterThan(0)
    const entries = document.querySelectorAll('.about-body .timeline-entry')
    // The education timeline's entries are in the same page.
    expect(entries.length).toBe(experience.length + education.length)
    for (const entry of experience) {
      expect(screen.getAllByText(entry.company).length).toBeGreaterThan(0)
      // meta is rendered through CSS text-transform: uppercase, so the DOM
      // text is still the original mixed-case string — assert the raw value.
      expect(screen.getByText(entry.meta)).toBeInTheDocument()
      const roles = entry.roles ?? [entry]
      for (const role of roles) {
        for (const bullet of role.bullets) {
          expect(screen.getByText(bullet)).toBeInTheDocument()
        }
      }
    }
  })

  it('nests the roles under their employer, in order', () => {
    render(<About />)
    const employer = experience.find((entry) => entry.roles)
    expect(employer.roles.length).toBeGreaterThan(1)
    const group = screen.getByRole('heading', {
      level: 3,
      name: employer.company,
    }).parentElement
    expect(within(group).getByText(employer.blurb)).toBeInTheDocument()
    const titles = within(group)
      .getAllByRole('heading', { level: 4 })
      .map((heading) => heading.textContent)
    expect(titles).toEqual(employer.roles.map((role) => role.title))
    for (const role of employer.roles) {
      expect(within(group).getByText(role.dates)).toBeInTheDocument()
    }
  })

  it('renders each employer’s bullets as a real list', () => {
    render(<About />)
    for (const entry of experience.filter((e) => e.bullets)) {
      const item = screen.getByText(entry.role).closest('.timeline-entry')
      const list = item.querySelector('ul.timeline-points')
      expect(list).not.toBeNull()
      expect(list.getAttribute('role')).toBeNull()
      expect(within(list).getAllByRole('listitem')).toHaveLength(
        entry.bullets.length,
      )
    }
  })

  it('marks the present role, and only that one', () => {
    render(<About />)
    const current = document.querySelectorAll(
      '.timeline-entry.current, .timeline-step.current',
    )
    expect(current).toHaveLength(1)
    const employer = experience.find((entry) => entry.roles)
    const present = employer.roles.find((role) => role.current)
    expect(current[0]).toHaveClass('timeline-step')
    expect(current[0]).toHaveTextContent(present.title)
  })

  it('orders headings page title, section, employer, role', () => {
    render(<About />)
    const levels = screen
      .getAllByRole('heading')
      .map((heading) => Number(heading.tagName[1]))
    expect(levels[0]).toBe(1)
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1)
    }
  })

  it('sums up the profile beside the body, with the resume', () => {
    render(<About />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'About' }),
    ).toBeInTheDocument()
    for (const fact of profile.aboutFacts) {
      expect(screen.getByText(fact.label).nextSibling).toHaveTextContent(
        fact.value,
      )
    }
    expect(screen.getByRole('link', { name: 'Resume PDF' })).toHaveAttribute(
      'href',
      '/resume.pdf',
    )
  })

  it('renders every toolbox chip', () => {
    render(<About />)
    expect(profile.toolbox.length).toBeGreaterThan(0)
    for (const tool of profile.toolbox) {
      expect(screen.getByText(tool)).toBeInTheDocument()
    }
  })

  it('renders every area of expertise', () => {
    render(<About />)
    expect(
      screen.getByRole('heading', { name: 'Areas of expertise' }),
    ).toBeInTheDocument()
    expect(profile.expertise.length).toBeGreaterThan(0)
    for (const area of profile.expertise) {
      expect(screen.getByText(area)).toBeInTheDocument()
    }
  })

  // Every test above queries expertise and toolbox entries by exact text.
  // A string appearing in both arrays makes getByText match two elements
  // and throw inside an unrelated rendering test, which points at About.jsx
  // rather than at the data. Assert the invariant directly so a collision
  // names the duplicated string instead.
  it('keeps every expertise and toolbox entry unique', () => {
    const counts = new Map()
    for (const entry of [...profile.expertise, ...profile.toolbox]) {
      counts.set(entry, (counts.get(entry) ?? 0) + 1)
    }
    const duplicates = [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([entry]) => entry)
    expect(duplicates, `duplicate entries: ${duplicates.join(', ')}`).toEqual(
      [],
    )
  })

  it('renders education entries and certifications', () => {
    render(<About />)
    expect(
      screen.getByRole('heading', { name: 'Education' }),
    ).toBeInTheDocument()
    expect(education.length).toBeGreaterThan(0)
    for (const entry of education) {
      expect(screen.getByText(entry.credential)).toBeInTheDocument()
      expect(screen.getByText(entry.school)).toBeInTheDocument()
      // meta is rendered through CSS text-transform: uppercase, so the DOM
      // text is still the original mixed-case string — assert the raw value.
      expect(screen.getByText(entry.meta)).toBeInTheDocument()
    }
    expect(certifications.length).toBeGreaterThan(0)
    for (const certification of certifications) {
      expect(screen.getByText(certification)).toBeInTheDocument()
    }
    expect(awards).toContain('Charter Champion Award')
    for (const award of awards) {
      expect(screen.getByText(award)).toBeInTheDocument()
    }
  })

  it('offers the resume as a downloadable PDF', () => {
    render(<About />)
    const link = screen.getByRole('link', {
      name: /download the full resume/i,
    })
    expect(link).toHaveAttribute('href', '/resume.pdf')
    expect(link).toHaveAttribute('download', 'Joey Haas Resume.pdf')
  })

  it('ends with how to reach me, built from the profile', () => {
    render(<About />)
    expect(screen.getByRole('link', { name: profile.email })).toHaveAttribute(
      'href',
      `mailto:${profile.email}`,
    )
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute(
      'href',
      profile.linkedin,
    )
    const pdf = screen.getByRole('link', { name: 'PDF' })
    expect(pdf).toHaveAttribute('href', '/resume.pdf')
    expect(pdf).toHaveAttribute('download', 'Joey Haas Resume.pdf')
  })

  // The link above is only as good as the file behind it: a renamed or
  // deleted PDF still leaves the anchor's href/download attributes green,
  // and the SPA rewrite serves index.html (a 200, not a 404) for a missing
  // /resume.pdf, so nothing else would catch it.
  it('ships the linked PDF', () => {
    // Not `new URL(..., import.meta.url)`: the jsdom test environment
    // overrides the global URL constructor, which resolves a relative path
    // against jsdom's fake http://localhost origin instead of this file's
    // real file:// location. Resolving as a plain path sidesteps that.
    const pdfPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../public/resume.pdf',
    )
    const bytes = readFileSync(pdfPath)
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
