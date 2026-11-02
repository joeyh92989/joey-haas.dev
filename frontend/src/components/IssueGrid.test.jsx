import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import IssueGrid, { ISSUE_GRID_CAP } from './IssueGrid.jsx'

const DETAIL = {
  owned_text: '1–4, 6',
  released: 7,
  ongoing: true,
  read_to: 2,
  segments: [
    { kind: 'owned', length: 4 },
    { kind: 'missing', length: 1 },
    { kind: 'owned', length: 1 },
    { kind: 'missing', length: 1 },
    { kind: 'upcoming', length: 3 },
  ],
  editions: [{ kind: 'trade', label: 'Vol. 1', from_issue: 1, to_issue: 3 }],
  next_issue: { number: '8', store_date: '2026-11-11' },
}

const kinds = (container) =>
  [...container.querySelectorAll('.issue-grid > *')].map(
    (cell) => cell.dataset.k,
  )

describe('IssueGrid', () => {
  it('marks each issue read, owned or missing, then the next one', () => {
    const { container } = render(<IssueGrid detail={DETAIL} />)
    expect(kinds(container)).toEqual([
      'read',
      'read',
      'owned',
      'owned',
      'missing',
      'owned',
      'missing',
      'unreleased',
    ])
    // Public: decoration, no toggles.
    expect(container.querySelector('.issue-grid')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('toggles uncovered issues and names the edition on covered ones (D6)', () => {
    const onToggle = vi.fn()
    const { container } = render(
      <IssueGrid detail={DETAIL} onToggle={onToggle} />,
    )
    const group = screen.getByRole('group', { name: 'Issues I own' })
    expect(group).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Issue 1' })).toBeNull()
    expect(container.querySelector('[title="In Vol. 1"]')).toHaveTextContent(
      '1',
    )

    const four = screen.getByRole('button', { name: 'Issue 4' })
    expect(four).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(four)
    expect(onToggle).toHaveBeenLastCalledWith(4, false)
    fireEvent.click(screen.getByRole('button', { name: 'Issue 5' }))
    expect(onToggle).toHaveBeenLastCalledWith(5, true)
  })

  it('ignores the toggles while a save runs, keeping them focusable', () => {
    const onToggle = vi.fn()
    render(<IssueGrid detail={DETAIL} onToggle={onToggle} busy />)
    const five = screen.getByRole('button', { name: 'Issue 5' })
    five.focus()
    fireEvent.click(five)
    expect(onToggle).not.toHaveBeenCalled()
    expect(five).toHaveAttribute('aria-disabled', 'true')
    expect(five).not.toBeDisabled()
    expect(five).toHaveFocus()
  })

  it('names an edition cell’s state in words when signed in', () => {
    render(<IssueGrid detail={DETAIL} onToggle={() => {}} />)
    expect(
      screen.getByRole('img', { name: 'Issue 3, owned, in Vol. 1' }),
    ).toHaveTextContent('3')
  })

  it('falls back to the run bar past the cap', () => {
    const { container } = render(
      <IssueGrid
        detail={{ ...DETAIL, released: ISSUE_GRID_CAP + 1, owned_text: '1–10' }}
      />,
    )
    expect(container.querySelector('.issue-grid')).toBeNull()
    expect(
      screen.getByRole('img', {
        name: `10 of ${ISSUE_GRID_CAP + 1} issues owned, ongoing`,
      }),
    ).toBeInTheDocument()
  })

  it('has no axe violations either way', async () => {
    const pub = render(<IssueGrid detail={DETAIL} />)
    expect(await axeViolations(pub.container)).toEqual([])
    pub.unmount()
    const admin = render(<IssueGrid detail={DETAIL} onToggle={() => {}} />)
    expect(await axeViolations(admin.container)).toEqual([])
  })
})
