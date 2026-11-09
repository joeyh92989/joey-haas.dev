import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import DailyResult from './DailyResult.jsx'
import { axeViolations } from '../lib/axe.test-util.js'

const ANSWER = {
  id: 'sea',
  title: 'Sea of Stars',
  platform: 'Nintendo Switch',
  year: 2023,
  genres: ['Role-playing (RPG)', 'Adventure'],
  time_to_beat_hours: 12,
  cover_url: null,
}

function renderResult(props) {
  const onShare = vi.fn()
  const utils = render(
    <MemoryRouter>
      <DailyResult answer={ANSWER} onShare={onShare} {...props} />
    </MemoryRouter>,
  )
  return { ...utils, onShare }
}

describe('DailyResult', () => {
  it('says the win, the facts and links the item page', async () => {
    const { container, onShare } = renderResult({ won: true, guesses: 3 })
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Got it in 3.',
    )
    expect(
      screen.getByText(
        'Switch · 2023 · RPG, Adventure · Medium · about 12 h to finish',
      ),
    ).toBeInTheDocument()
    screen.getAllByRole('link').forEach((link) => {
      expect(link).toHaveAttribute('href', '/shelf/sea/')
    })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Share' }))
    expect(onShare).toHaveBeenCalledTimes(1)
    expect(await axeViolations(container)).toEqual([])
  })

  it('names the answer on a loss', () => {
    renderResult({ won: false, guesses: 6 })
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Not today. It was Sea of Stars.',
    )
  })
})
