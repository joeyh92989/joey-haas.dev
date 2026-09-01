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
    for (const entry of experience) {
      expect(screen.getByText(entry.role)).toBeInTheDocument()
      expect(screen.getAllByText(entry.company).length).toBeGreaterThan(0)
    }
  })

  it('renders every toolbox chip', () => {
    render(<About />)
    for (const tool of profile.toolbox) {
      expect(screen.getByText(tool)).toBeInTheDocument()
    }
  })

  it('renders education entries and certifications', () => {
    render(<About />)
    expect(
      screen.getByRole('heading', { name: 'Education' }),
    ).toBeInTheDocument()
    for (const entry of education) {
      expect(screen.getByText(entry.credential)).toBeInTheDocument()
      expect(screen.getByText(entry.school)).toBeInTheDocument()
    }
    for (const certification of certifications) {
      expect(screen.getByText(certification)).toBeInTheDocument()
    }
  })
})
