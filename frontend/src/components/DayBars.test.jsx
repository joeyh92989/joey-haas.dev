import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import DayBars from './DayBars.jsx'

const SERIES = [
  { day: '2026-10-10', views: 2 },
  { day: '2026-10-11', views: 8 },
  { day: '2026-10-12', views: 1 },
  { day: '2026-10-13', views: 8 },
  { day: '2026-10-14', views: 0 },
]

describe('DayBars', () => {
  it('names each bar and marks the latest of the highest days', () => {
    render(<DayBars series={SERIES} />)
    const bars = screen.getAllByRole('img')
    expect(bars).toHaveLength(5)
    expect(bars[1]).toHaveAccessibleName('Sun 11 Oct: 8 views')
    expect(bars[2]).toHaveAccessibleName('Mon 12 Oct: 1 view')
    expect(bars.filter((bar) => bar.classList.contains('peak'))).toEqual([
      bars[3],
    ])
    expect(bars[3].style.height).toBe('100%')
    expect(bars[0].style.height).toBe('25%')
  })

  it('holds the same figures in a hidden table', () => {
    render(<DayBars series={SERIES} />)
    const table = screen.getByRole('table', { name: 'Views per UTC day' })
    expect(table).toHaveClass('visually-hidden')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([
      'Sat 10 Oct2',
      'Sun 11 Oct8',
      'Mon 12 Oct1',
      'Tue 13 Oct8',
      'Wed 14 Oct0',
    ])
  })

  it('labels at most five days under a long range, first and last included', () => {
    const series = Array.from({ length: 30 }, (_, n) => ({
      day: `2026-09-${String(n + 1).padStart(2, '0')}`,
      views: n,
    }))
    const { container } = render(<DayBars series={series} />)
    const labels = [...container.querySelectorAll('.day-bars-axis span')]
    expect(labels.map((label) => label.textContent)).toEqual([
      '1 Sept',
      '8 Sept',
      '16 Sept',
      '23 Sept',
      '30 Sept',
    ])
  })

  it('marks no peak when every day is zero', () => {
    render(<DayBars series={[{ day: '2026-10-10', views: 0 }]} />)
    expect(screen.getByRole('img')).not.toHaveClass('peak')
  })
})
