import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { certifications, education } from '../content/education.js'
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

  it('renders every experience entry', () => {
    render(<About />)
    expect(experience.length).toBeGreaterThan(0)
    for (const entry of experience) {
      expect(screen.getByText(entry.role)).toBeInTheDocument()
      expect(screen.getAllByText(entry.company).length).toBeGreaterThan(0)
      // meta is rendered through CSS text-transform: uppercase, so the DOM
      // text is still the original mixed-case string — assert the raw value.
      expect(screen.getByText(entry.meta)).toBeInTheDocument()
      expect(screen.getByText(entry.summary)).toBeInTheDocument()
    }
  })

  it('renders every toolbox chip', () => {
    render(<About />)
    expect(profile.toolbox.length).toBeGreaterThan(0)
    for (const tool of profile.toolbox) {
      expect(screen.getByText(tool)).toBeInTheDocument()
    }
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
  })

  it('offers the resume as a downloadable PDF', () => {
    render(<About />)
    const link = screen.getByRole('link', {
      name: /download the full resume/i,
    })
    expect(link).toHaveAttribute('href', '/resume.pdf')
    expect(link).toHaveAttribute('download', 'Joey Haas Resume.pdf')
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
