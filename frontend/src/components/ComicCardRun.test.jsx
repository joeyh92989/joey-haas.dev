import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import ComicCardRun from './ComicCardRun.jsx'

const ROW = {
  owned: 4,
  released: 4,
  missing: 0,
  ongoing: false,
  wanted: false,
  read: 0,
  read_to: null,
  read_next: 1,
  next_issue: null,
  segments: [{ kind: 'owned', length: 4 }],
}

describe('ComicCardRun', () => {
  it('draws a block per issue for a four-issue run', async () => {
    const { container } = render(<ComicCardRun row={ROW} />)
    const lanes = screen.getByRole('img', { name: '4 of 4 issues owned' })
    expect(
      lanes.querySelectorAll('.lane:first-child .lane-track i'),
    ).toHaveLength(4)
    expect(container).toHaveTextContent('4/4 · Complete run')
    expect(container).toHaveTextContent('read next: #1')
    expect(await axeViolations(container)).toEqual([])
  })

  it('leads an ongoing run with its next dated issue', () => {
    render(
      <ComicCardRun
        row={{
          ...ROW,
          owned: 26,
          released: 26,
          ongoing: true,
          read_to: 24,
          read: 24,
          read_next: 25,
          segments: [
            { kind: 'owned', length: 26 },
            { kind: 'upcoming', length: 3 },
          ],
          next_issue: { number: '27', store_date: '2026-12-09' },
        }}
      />,
    )
    expect(document.body).toHaveTextContent('26/26+ · Next #27 · Dec 9')
    expect(document.body).toHaveTextContent('read next: #25')
  })

  it.each([
    [
      { ...ROW, owned: 0, wanted: true, released: 58, segments: [] },
      '58 out · none owned',
    ],
    [{ ...ROW, owned: 0, segments: [] }, 'Issues not recorded'],
  ])('draws no lanes for %#', (row, text) => {
    render(<ComicCardRun row={row} />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(document.body).toHaveTextContent(text)
  })

  it('says all read', () => {
    render(
      <ComicCardRun row={{ ...ROW, read_to: 4, read: 4, read_next: null }} />,
    )
    expect(document.body).toHaveTextContent('all read')
  })
})
