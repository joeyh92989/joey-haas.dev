import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CoverKey from './CoverKey.jsx'

describe('CoverKey', () => {
  it('names every mark a cover can carry, in one list', () => {
    render(<CoverKey />)
    const key = screen.getByRole('list', { name: 'Key to the marks on covers' })
    const names = within(key)
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(names).toEqual([
      'Key',
      'Playing',
      'Paused',
      'Finished',
      'Abandoned',
      '×2Finished twice',
      '♥Favorite',
      'Backlog (no mark)',
    ])
  })

  it('draws the marks with the covers’ own classes', () => {
    render(<CoverKey />)
    expect(
      [...document.querySelectorAll('.status-mark')].map(
        (mark) => mark.dataset.status,
      ),
    ).toEqual(['active', 'paused', 'finished', 'abandoned'])
    expect(document.querySelector('.replay-mark')).not.toBeNull()
    expect(document.querySelector('.poster-heart')).not.toBeNull()
  })

  it('hides the drawn marks from assistive tech', () => {
    render(<CoverKey />)
    for (const mark of document.querySelectorAll(
      '.status-mark, .replay-mark, .poster-heart',
    ))
      expect(mark).toHaveAttribute('aria-hidden', 'true')
  })

  // Numbered cards (#532) say the status in words on their strip, so the key
  // keeps only the marks that are still on the cover.
  it('leaves the status marks out when the cards say them in words', () => {
    render(<CoverKey statuses={false} />)
    const key = screen.getByRole('list', { name: 'Key to the marks on covers' })
    expect(
      within(key)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Key', '×2Finished twice', '♥Favorite'])
    expect(document.querySelector('.status-mark')).toBeNull()
  })
})
