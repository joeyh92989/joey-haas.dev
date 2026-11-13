import '@testing-library/jest-dom'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { photo } from '../../lib/intake.test-util.js'
import PhotoTile from './PhotoTile.jsx'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function tile(props) {
  return render(
    <ul>
      <PhotoTile
        photo={photo('p1', 'uploaded')}
        number={1}
        titles={0}
        budgetSpent={false}
        onRetry={() => {}}
        {...props}
      />
    </ul>,
  )
}

describe('PhotoTile waits', () => {
  it('says how many photos are ahead of a waiting one', () => {
    tile({ ahead: 2 })
    expect(screen.getByText('waiting to be read · 2 ahead')).toBeVisible()
  })

  it('says next when nothing is ahead', () => {
    tile({ ahead: 0 })
    expect(screen.getByText('waiting to be read · next')).toBeVisible()
  })

  it('keeps the budget words when the budget is spent', () => {
    tile({ ahead: 2, budgetSpent: true })
    expect(screen.queryByText(/ahead/)).toBeNull()
  })

  it('counts seconds while a photo is read, and owns up to a long read at 30 s', () => {
    tile({ photo: photo('p1', 'reading') })
    expect(screen.getByText('reading · 0 s')).toBeVisible()
    act(() => vi.advanceTimersByTime(29_000))
    expect(screen.getByText('reading · 29 s')).toBeVisible()
    expect(screen.queryByText(/still reading/)).toBeNull()
    act(() => vi.advanceTimersByTime(1_000))
    expect(screen.getByText('reading · 30 s')).toBeVisible()
    expect(
      screen.getByText('still reading; the model can take a minute or two'),
    ).toBeVisible()
  })

  it('reads as reading while its request is in flight, though the server said uploaded', () => {
    tile({ reading: true })
    expect(screen.getByText('reading · 0 s')).toBeVisible()
  })
})
