import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StatePill from './StatePill.jsx'

describe('StatePill', () => {
  it.each([
    ['read', 'Read ✓'],
    ['owned', 'Owned'],
    ['missing', 'Missing'],
    ['not-out', 'Not out yet'],
    ['skipped', 'Skipped · private'],
  ])('words %s as %s', (state, word) => {
    render(<StatePill state={state} />)
    expect(screen.getByText(word)).toHaveAttribute('data-state', state)
  })
})
