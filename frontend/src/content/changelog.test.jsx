import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { CHANGELOG, parseChangelog, renderLine } from './changelog.js'

const FILE = `# Changes

Some prose about the file.

## 2026-10-23

- Older change.

## 2026-11-04

- [My Shelf](/shelf) shows what I am playing,
  continued on the next line.
- A second change with [two](/a) links, one [outside](https://x.test/p).
`

describe('parseChangelog', () => {
  it('reads dated entries newest first, joining continued lines', () => {
    const entries = parseChangelog(FILE)
    expect(entries.map((entry) => entry.date)).toEqual([
      '2026-11-04',
      '2026-10-23',
    ])
    expect(entries[0].lines).toEqual([
      '[My Shelf](/shelf) shows what I am playing, continued on the next line.',
      'A second change with [two](/a) links, one [outside](https://x.test/p).',
    ])
    expect(entries[1].lines).toEqual(['Older change.'])
  })

  it('throws on a heading that is not a date', () => {
    expect(() => parseChangelog('## November\n\n- x\n')).toThrow(
      'not a date heading',
    )
    expect(() => parseChangelog('## 2026-11-4\n\n- x\n')).toThrow(
      'not a date heading',
    )
  })

  it('throws on a date with no changes, last or not', () => {
    expect(() => parseChangelog('## 2026-11-04\n')).toThrow('no changes')
    expect(() =>
      parseChangelog('## 2026-11-04\n\n## 2026-11-03\n\n- x\n'),
    ).toThrow('no changes under 2026-11-04')
  })

  it('throws on text that is not a bullet under a date', () => {
    expect(() => parseChangelog('## 2026-11-04\n\nA paragraph.\n')).toThrow(
      'not a bullet',
    )
  })
})

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
