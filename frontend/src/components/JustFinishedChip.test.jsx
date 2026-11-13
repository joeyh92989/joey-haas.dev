import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import JustFinishedChip from './JustFinishedChip.jsx'

const FINISH = {
  item_id: 'x1',
  title: 'Xenoblade Chronicles 3',
  cover_url: 'https://images.igdb.com/x.jpg',
  finished_at: '2026-10-26',
  time_to_beat_hours: 61.6,
}

describe('JustFinishedChip', () => {
  it('reads the title, the day and the hours', () => {
    const { container } = render(<JustFinishedChip finish={FINISH} />)
    expect(container.querySelector('.tj-a')).toHaveTextContent(
      'Just finished Xenoblade Chronicles 3',
    )
    expect(container.querySelector('.tj-b')).toHaveTextContent(
      'Mon 26 Oct · 62 h',
    )
    expect(screen.getByText('Xenoblade Chronicles 3').tagName).toBe('B')
  })

  it('is two text runs with no pill, so the layout can stack them', () => {
    const { container } = render(<JustFinishedChip finish={FINISH} />)
    const chip = container.firstChild
    expect(chip.classList.contains('tonight-just')).toBe(true)
    expect([...chip.children].map((el) => el.className)).toEqual([
      'tonight-just-thumb',
      'tj-a',
      'tj-b',
    ])
  })

  it('hides the thumb from screen readers', () => {
    const { container } = render(<JustFinishedChip finish={FINISH} />)
    expect(container.querySelector('.tonight-just-thumb')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })

  it('leaves the hours out when they are unknown', () => {
    const { container } = render(
      <JustFinishedChip finish={{ ...FINISH, time_to_beat_hours: null }} />,
    )
    expect(container.querySelector('.tj-b')).toHaveTextContent(/^Mon 26 Oct$/)
  })
})

describe('JustFinishedChip with a rating', () => {
  it('shows the stars after the hours', () => {
    const { container } = render(
      <JustFinishedChip finish={{ ...FINISH, rating: 9 }} />,
    )
    expect(container.querySelector('.tj-b')).toHaveTextContent(
      'Mon 26 Oct · 62 h · ★★★★½',
    )
    expect(screen.getByRole('img', { name: '9 out of 10' })).toBeInTheDocument()
  })

  it('shows no stars without one', () => {
    render(<JustFinishedChip finish={{ ...FINISH, rating: null }} />)
    expect(screen.queryByRole('img')).toBeNull()
  })
})
