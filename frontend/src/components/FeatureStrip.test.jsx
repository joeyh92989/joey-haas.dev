import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import FeatureStrip from './FeatureStrip.jsx'

describe('FeatureStrip', () => {
  it('links the tour and each of five features to its stop', () => {
    render(
      <MemoryRouter>
        <FeatureStrip />
      </MemoryRouter>,
    )

    const strip = screen.getByRole('region', { name: 'What it does' })
    expect(
      within(strip).getByRole('link', { name: /Take the tour/ }),
    ).toHaveAttribute('href', '/shelf/how')
    const cards = within(strip.querySelector('ul')).getAllByRole('link')
    expect(cards.map((card) => card.getAttribute('href'))).toEqual([
      '/shelf/how#stop-1',
      '/shelf/how#stop-2',
      '/shelf/how#stop-3',
      '/shelf/how#stop-4',
      '/shelf/how#stop-7',
    ])
    expect(cards[0]).toHaveAccessibleName(/^Reads the shelf/)
  })
})
