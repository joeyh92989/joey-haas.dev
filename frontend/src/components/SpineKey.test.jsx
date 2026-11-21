import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SpineKey from './SpineKey.jsx'

describe('SpineKey', () => {
  it('names the filled and the outlined mark in words', () => {
    render(<SpineKey />)
    const key = screen.getByRole('list', { name: 'Key to the marks on spines' })
    expect(
      within(key)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Key', 'Playing or finished', 'Any other status'])
    const squares = key.querySelectorAll('[data-slot="status-mark-square"]')
    expect([...squares].map((s) => s.getAttribute('data-filled'))).toEqual([
      'true',
      'false',
    ])
  })
})
