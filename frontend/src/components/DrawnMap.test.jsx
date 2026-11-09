import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import CroatiaGreeceMap, {
  fit as croatiaFit,
  viewBox as croatiaViewBox,
} from '../content/maps/croatia-greece-2026.jsx'
import { axeViolations } from '../lib/axe.test-util.js'
import { fitFromPoints, isOnMap, isTrueToScale } from '../lib/mapFit.js'
import DrawnMap from './DrawnMap.jsx'

// A 100 × 100 square covering 10°E–20°E and 40°N–50°N.
const VIEWBOX = { width: 100, height: 100 }
const FIT = fitFromPoints([
  { lat: 50, lon: 10, x: 0, y: 0 },
  { lat: 40, lon: 20, x: 100, y: 100 },
])
const Drawing = () => <g data-testid="drawing" />

const STOPS = [
  { name: 'Alpha', lat: 48, lon: 12, href: '#day-1' },
  { name: 'Beta', lat: 45, lon: 18, href: '#day-2' },
  { name: 'Faraway', lat: 45, lon: 40, href: '#day-3' },
]

function renderMap(stops = STOPS) {
  return render(
    <DrawnMap
      drawing={Drawing}
      fit={FIT}
      stops={stops}
      viewBox={VIEWBOX}
      label="Route"
    />,
  )
}

describe('DrawnMap', () => {
  it('names the drawing with every stop in order', () => {
    renderMap()
    expect(
      screen.getByRole('img', { name: 'Route: Alpha, Beta, Faraway' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('drawing')).toBeInTheDocument()
  })

  it('links each pin to its day, numbered in order', () => {
    renderMap()
    expect(screen.getByRole('link', { name: '1. Alpha' })).toHaveAttribute(
      'href',
      '#day-1',
    )
    const beta = screen.getByRole('link', { name: '2. Beta' })
    expect(beta).toHaveAttribute('href', '#day-2')
    expect(beta).toHaveStyle({ left: '80%', top: '50%' })
    // Far right: its name sits to the left of the pin.
    expect(beta).toHaveClass('drawn-map__pin--label-left')
  })

  it('drops the pin for a stop off the drawing but keeps it in the list', () => {
    const { container } = renderMap()
    expect(screen.queryByRole('link', { name: '3. Faraway' })).toBeNull()
    expect(container.querySelectorAll('.drawn-map__pin')).toHaveLength(2)
    const list = container.querySelector('.drawn-map__stops')
    const items = within(list).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'Alpha',
      'Beta',
      'Faraway',
    ])
    expect(within(list).getByRole('link', { name: 'Faraway' })).toHaveAttribute(
      'href',
      '#day-3',
    )
  })

  it('shows the note in the caption', () => {
    renderMap()
    expect(screen.getByText('Drawn route, not a live map.')).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = renderMap()
    expect(await axeViolations(container)).toEqual([])
  })
})

describe('the Croatia & Greece drawing', () => {
  const NAXOS = { lat: 37.1036, lon: 25.3767 }

  it('is drawn to scale', () => {
    expect(isTrueToScale(croatiaFit)).toBe(true)
  })

  it('has room for every stop of the trip', () => {
    for (const place of [
      { lat: 42.6507, lon: 18.0944 },
      { lat: 37.9838, lon: 23.7275 },
      NAXOS,
    ]) {
      expect(isOnMap(croatiaFit, place, croatiaViewBox)).toBe(true)
    }
  })

  it('renders land, route and seas, hidden from assistive tech', () => {
    const { container } = render(
      <svg>
        <CroatiaGreeceMap />
      </svg>,
    )
    const group = container.querySelector('g')
    expect(group).toHaveAttribute('aria-hidden', 'true')
    expect(
      container.querySelector('.drawn-map__land').getAttribute('d'),
    ).toMatch(/^M[-\d. L]+Z/)
    expect(container.querySelector('.drawn-map__route')).not.toBeNull()
    expect(
      [...container.querySelectorAll('.drawn-map__sea-label')].map(
        (label) => label.textContent,
      ),
    ).toEqual(['ADRIATIC', 'IONIAN', 'AEGEAN'])
  })
})
