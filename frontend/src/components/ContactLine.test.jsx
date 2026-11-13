import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ContactLine from './ContactLine.jsx'

const mocks = vi.hoisted(() => ({ linkedin: 'https://example.com/in/joey' }))

vi.mock('../content/profile.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    profile: {
      ...actual.profile,
      get linkedin() {
        return mocks.linkedin
      },
    },
  }
})

describe('ContactLine', () => {
  it('links email, LinkedIn and the resume PDF', () => {
    mocks.linkedin = 'https://example.com/in/joey'
    render(<ContactLine />)
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute(
      'href',
      'https://example.com/in/joey',
    )
    expect(screen.getByRole('link', { name: 'Resume (PDF)' })).toHaveAttribute(
      'href',
      '/resume.pdf',
    )
  })

  it('drops the LinkedIn link when no URL is set', () => {
    mocks.linkedin = ''
    const { container } = render(<ContactLine />)
    expect(screen.queryByRole('link', { name: 'LinkedIn' })).toBeNull()
    expect(container.querySelector('p')).toHaveTextContent(
      /^Reach me at \S+@\S+\. The full resume is a PDF\.$/,
    )
  })
})
