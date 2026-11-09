import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import WeatherPanel, { wetRuns } from './WeatherPanel.jsx'

const LABELS = [
  '8a',
  '9a',
  '10a',
  '11a',
  'noon',
  '1p',
  '2p',
  '3p',
  '4p',
  '5p',
  '6p',
  '7p',
  '8p',
]

function hours(wet = []) {
  return LABELS.map((label, i) => ({
    hour: 8 + i,
    label,
    temp_f: 40 + i,
    precip_pct: wet.includes(i) ? 60 : 10,
    wind_mph: 5,
    wet: wet.includes(i),
    rideable: !wet.includes(i),
  }))
}

function day(fields = {}) {
  return {
    date: '2026-11-14',
    name: 'Saturday',
    high: 52,
    low: 40,
    summary: 'Mostly Sunny',
    hours: hours(),
    verdict: { state: 'ok', text: 'Dry 8a–8p: ride', window: '8a–8p' },
    ...fields,
  }
}

describe('wetRuns', () => {
  it('names runs of wet hours and single wet hours', () => {
    expect(wetRuns(hours([2, 3, 4, 5, 6, 7, 8, 11]))).toEqual(['10a–4p', '7p'])
  })

  it('closes a run that reaches the last hour', () => {
    expect(wetRuns(hours([11, 12]))).toEqual(['7p–8p'])
  })

  it('is empty on a dry day', () => {
    expect(wetRuns(hours())).toEqual([])
  })
})

describe('WeatherPanel', () => {
  it('draws the day as one named image with high, low and verdict', () => {
    const { container } = render(<WeatherPanel day={day()} range={[30, 60]} />)
    expect(screen.getByText('Saturday · Nov 14')).toBeInTheDocument()
    expect(screen.getByText('52° / 40°')).toBeInTheDocument()
    expect(
      screen.getByRole('img', {
        name: 'Temperatures from 8a to 8p, 40° to 52°; dry all day',
      }),
    ).toBeInTheDocument()
    expect(container.querySelectorAll('.wx-bars i')).toHaveLength(13)
    expect(screen.getByText('Mostly Sunny')).toBeInTheDocument()
    expect(screen.getByText('Dry 8a–8p: ride')).toBeInTheDocument()
    expect(container.querySelector('.status-dot')).toHaveClass('ok')
  })

  it('names and hatches the wet hours, and marks a warning verdict', () => {
    const { container } = render(
      <WeatherPanel
        day={day({
          summary: 'Chance Rain',
          hours: hours([2, 3]),
          verdict: { state: 'warn', text: 'Wet 10a–11a', window: null },
        })}
      />,
    )
    expect(
      screen.getByRole('img', { name: /; wet 10a–11a$/ }),
    ).toBeInTheDocument()
    expect(container.querySelectorAll('.wx-bars i.wet')).toHaveLength(2)
    expect(screen.getByText(/Chance Rain/)).toHaveTextContent(
      'Chance Rain · Wet 10a–11a',
    )
    expect(container.querySelector('.status-dot')).toHaveClass('stale')
  })

  it('shows only the verdict for a day with no hours', () => {
    render(
      <WeatherPanel
        day={day({
          high: null,
          low: null,
          summary: null,
          hours: [],
          verdict: { state: 'warn', text: 'No forecast yet', window: null },
        })}
      />,
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByText(/°/)).not.toBeInTheDocument()
    expect(screen.getByText('No forecast yet')).toBeInTheDocument()
  })
})
