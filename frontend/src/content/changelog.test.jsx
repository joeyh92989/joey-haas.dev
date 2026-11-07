import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { CHANGELOG, isRouterPath, renderLine } from './changelog.js'

describe('renderLine', () => {
  it('returns plain text as one node', () => {
    expect(renderLine('Older change.')).toEqual(['Older change.'])
  })

  it('renders a path as a router link and a URL as an anchor', () => {
    render(
      <MemoryRouter>
        <p>
          {renderLine('See [the shelf](/shelf) or [docs](https://x.test/p).')}
        </p>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'the shelf' })).toHaveAttribute(
      'href',
      '/shelf',
    )
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute(
      'href',
      'https://x.test/p',
    )
    expect(screen.getByText(/See/)).toHaveTextContent('See the shelf or docs.')
  })
})

describe('isRouterPath', () => {
  it('routes pages and leaves files and other hosts to the browser', () => {
    expect(isRouterPath('/shelf')).toBe(true)
    expect(isRouterPath('/til/some-note')).toBe(true)
    expect(isRouterPath('/shelf/?sort=rating')).toBe(true)
    expect(isRouterPath('/resume.pdf')).toBe(false)
    expect(isRouterPath('/til/feed.xml')).toBe(false)
    expect(isRouterPath('//cdn.test/x')).toBe(false)
    expect(isRouterPath('https://x.test/p')).toBe(false)
  })

  it('renders a site file as a plain anchor', () => {
    render(
      <MemoryRouter>
        <p>{renderLine('The [resume](/resume.pdf).')}</p>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'resume' })).toHaveAttribute(
      'rel',
      'noreferrer',
    )
  })
})

describe('the shipped changelog', () => {
  it('parses, and its first entry is the stats page', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0)
    expect(CHANGELOG[0].date).toBe('2026-11-06')
    expect(CHANGELOG[0].lines[0]).toContain('[Stats](/stats)')
    for (const entry of CHANGELOG) {
      expect(entry.lines.length).toBeGreaterThan(0)
    }
  })
})
