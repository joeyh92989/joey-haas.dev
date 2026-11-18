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

  describe('the title kind', () => {
    const BOOKS = {
      title: 'Lantern Tales',
      owned: 0,
      released: 0,
      missing: 0,
      segments: [],
      read: 0,
      read_to: null,
      read_next: null,
    }

    it('says Run of issues over a run and keeps its lanes', () => {
      render(<ComicCardRun row={{ ...ROW, title: 'Saga', kind: 'run' }} />)
      expect(screen.getByText('Run of issues')).toBeInTheDocument()
      expect(
        screen.getByRole('img', { name: '4 of 4 issues owned' }),
      ).toBeInTheDocument()
      expect(screen.queryByText(/Vol\./)).toBeNull()
    })

    it('reads a row with no kind as a run', () => {
      render(<ComicCardRun row={ROW} />)
      expect(screen.getByText('Run of issues')).toBeInTheDocument()
    })

    it('says which volumes a line of books owns, and draws no lanes or empty run text', () => {
      const { container } = render(
        <ComicCardRun
          row={{
            ...BOOKS,
            kind: 'book_line',
            volumes_owned: 3,
            volume_numbers: [1, 2, 4],
          }}
        />,
      )
      expect(screen.getByText('Line of books')).toBeInTheDocument()
      expect(screen.getByText('Vol. 1, 2 and 4')).toBeInTheDocument()
      expect(container).not.toHaveTextContent(/ of \d/)
      expect(container).not.toHaveTextContent('Issues not recorded')
      expect(container.querySelector('.lanes')).toBeNull()
    })

    it('says a single book, with its number when it has one', () => {
      const { rerender } = render(
        <ComicCardRun
          row={{
            ...BOOKS,
            kind: 'single_book',
            volumes_owned: 1,
            volume_numbers: [3],
          }}
        />,
      )
      expect(screen.getByText('Single book')).toBeInTheDocument()
      expect(screen.getByText('Vol. 3')).toBeInTheDocument()
      rerender(
        <ComicCardRun
          row={{
            ...BOOKS,
            kind: 'single_book',
            volumes_owned: 1,
            volume_numbers: [],
          }}
        />,
      )
      expect(screen.getByText('Single book')).toBeInTheDocument()
      expect(screen.queryByText(/Vol\./)).toBeNull()
    })

    it('says both: the volumes, then the run with its lanes', () => {
      render(
        <ComicCardRun
          row={{
            ...ROW,
            title: 'Harbor Lights',
            kind: 'both',
            volumes_owned: 2,
            volume_numbers: [1, 3],
          }}
        />,
      )
      expect(screen.getByText('Books and issues')).toBeInTheDocument()
      expect(screen.getByText('Vol. 1 and 3')).toBeInTheDocument()
      expect(
        screen.getByRole('img', { name: '4 of 4 issues owned' }),
      ).toBeInTheDocument()
    })

    it('names the card by title and kind, with nothing hover-only', async () => {
      const { container } = render(
        <ComicCardRun
          row={{
            ...BOOKS,
            kind: 'book_line',
            volumes_owned: 2,
            volume_numbers: [1, 2],
          }}
        />,
      )
      expect(
        screen.getByRole('group', { name: 'Lantern Tales: Line of books' }),
      ).toBeInTheDocument()
      expect(await axeViolations(container)).toEqual([])
    })
  })
})
