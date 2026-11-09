import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SpotMap from './SpotMap.jsx'

// A 400 × 300 drawing whose fit puts 0.01° of latitude at 100 units.
const LNG_SCALE = 10000 * Math.cos((39.75 * Math.PI) / 180)
const DRAWING = {
  viewBox: [0, 0, 400, 300],
  fit: {
    points: [
      { lat: 39.765, lng: -105.0, x: 0, y: 0 },
      { lat: 39.735, lng: -105.0 + 400 / LNG_SCALE, x: 400, y: 300 },
    ],
  },
  arterials: 'M0 0L400 300',
  streets: 'M0 300L400 0',
  water: 'M200 0L200 300',
  parks: 'M10 10L20 10L20 20Z',
  labels: [{ text: 'LoDo', kind: 'area', x: 100, y: 100 }],
  attribution: {
    text: '© OpenStreetMap contributors',
    href: 'https://www.openstreetmap.org/copyright',
  },
}

const SPOTS = [
  {
    key: 'union',
    name: 'Union Station',
    lat: 39.75,
    lng: -105.0 + 200 / LNG_SCALE,
    pinLabel: 'Union Station, Kid-OK',
  },
  { key: 'far', name: 'Red Rocks', lat: 39.66, lng: -105.2 },
]

function renderMap(props = {}) {
  return render(
    <SpotMap
      drawing={DRAWING}
      spots={SPOTS}
      label="Map of downtown Denver"
      title="Downtown Denver"
      {...props}
    />,
  )
}

describe('SpotMap', () => {
  it('draws the ground with its name, title and attribution', () => {
    renderMap()
    expect(
      screen.getByRole('img', { name: 'Map of downtown Denver' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Downtown Denver')).toBeInTheDocument()
    expect(screen.getByText('LoDo')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '© OpenStreetMap contributors' }),
    ).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
  })

  it('pins a spot at its projected point and leaves one off the map out', () => {
    renderMap()
    const pins = screen.getAllByRole('button')
    expect(pins).toHaveLength(1)
    expect(pins[0]).toHaveAccessibleName('Union Station, Kid-OK')
    expect(pins[0].style.left).toBe('50%')
    expect(parseFloat(pins[0].style.top)).toBeCloseTo(50, 6)
  })

  it('selects a pin, and clears it on a second press or Escape', () => {
    const onSelect = vi.fn()
    const { rerender } = renderMap({ onSelect })
    const pin = screen.getByRole('button', { name: 'Union Station, Kid-OK' })
    expect(pin).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(pin)
    expect(onSelect).toHaveBeenLastCalledWith('union')

    rerender(
      <SpotMap
        drawing={DRAWING}
        spots={SPOTS}
        label="Map of downtown Denver"
        selected="union"
        onSelect={onSelect}
      />,
    )
    expect(pin).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(pin)
    expect(onSelect).toHaveBeenLastCalledWith(null)
    onSelect.mockClear()
    fireEvent.keyDown(pin, { key: 'Escape' })
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('shows the popover at the selected pin only', () => {
    const renderPopover = (spot) => <b>{spot.name}</b>
    const { rerender } = renderMap({ renderPopover })
    expect(screen.queryByText('Union Station')).not.toBeInTheDocument()
    rerender(
      <SpotMap
        drawing={DRAWING}
        spots={SPOTS}
        label="Map of downtown Denver"
        selected="union"
        renderPopover={renderPopover}
      />,
    )
    const card = screen.getByText('Union Station').parentElement
    expect(card).toHaveClass('spot-map-popover')
    expect(card.style.left).toBe('50%')
  })

  it('shows no popover for a selected spot off the map', () => {
    renderMap({
      selected: 'far',
      renderPopover: (spot) => <b>{spot.name}</b>,
    })
    expect(screen.queryByText('Red Rocks')).not.toBeInTheDocument()
  })
})
