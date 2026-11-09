import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import ContinueCard from './ContinueCard.jsx'
import { localToday } from '../lib/statusMoves.js'

const today = localToday()
const daysBack = (n) => {
  const date = new Date(`${today}T12:00:00`)
  date.setDate(date.getDate() - n)
  return localToday(date)
}

const card = (fields = {}) => ({
  item_id: 'c1',
  type: 'game',
  title: 'Hades II',
  cover_url: null,
  platform: 'Nintendo Switch 2',
  time_to_beat_hours: 30,
  playthrough: 1,
  playing_since: '2026-10-24',
  last_played_on: daysBack(1),
  journal_hours: 31.2,
  sessions: 9,
  stale: false,
  ...fields,
})

function renderCard(props = {}) {
  return render(
    <MemoryRouter>
      <ul>
        <ContinueCard card={card()} to="/shelf/c1/" {...props} />
      </ul>
    </MemoryRouter>,
  )
}

describe('ContinueCard', () => {
  it('shows the game in hand with its journal line and no buttons to a visitor', () => {
    renderCard()
    const article = screen.getByRole('article', { name: 'Hades II' })
    expect(within(article).getByText('Continue')).toBeInTheDocument()
    expect(
      within(article).getByRole('link', { name: 'Hades II' }),
    ).toHaveAttribute('href', '/shelf/c1/')
    expect(article.querySelector('.tonight-sessions')).toHaveTextContent(
      'Playing since Oct 24, 2026 · 31 h over 9 sessions · last played yesterday',
    )
    expect(within(article).queryByRole('button')).toBeNull()
    expect(within(article).getAllByRole('link')).toHaveLength(1)
  })

  it('omits hours without a journal and the date without a start', () => {
    renderCard({
      card: card({ sessions: 0, journal_hours: null, last_played_on: null }),
    })
    expect(
      screen.getByRole('article').querySelector('.tonight-sessions'),
    ).toHaveTextContent(/^Playing since Oct 24, 2026$/)
  })

  it('asks the owner the night’s question with Wrap up, Log tonight and Not tonight', async () => {
    const onWrapUp = vi.fn()
    const onLogTonight = vi.fn()
    const onSkip = vi.fn()
    renderCard({ signedIn: true, onWrapUp, onLogTonight, onSkip })
    expect(screen.getByText('Sitting down?')).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Wrap up: Hades II' }),
    )
    expect(onWrapUp).toHaveBeenCalledWith(
      expect.objectContaining({ item_id: 'c1' }),
      'finished',
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Log tonight: Hades II' }),
    )
    expect(onLogTonight).toHaveBeenCalledWith(
      expect.objectContaining({ item_id: 'c1' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Not tonight: Hades II' }),
    )
    expect(onSkip).toHaveBeenCalled()
  })

  it('disables Log tonight once a session exists for today', () => {
    renderCard({
      signedIn: true,
      loggedToday: true,
      onWrapUp: vi.fn(),
      onSkip: vi.fn(),
    })
    expect(
      screen.getByRole('button', { name: 'Logged tonight: Hades II' }),
    ).toBeDisabled()
  })

  it('turns stale: amber date in words, a different question, Pause first', async () => {
    const onWrapUp = vi.fn()
    renderCard({
      card: card({ last_played_on: daysBack(23), stale: true }),
      signedIn: true,
      onWrapUp,
      onSkip: vi.fn(),
    })
    const late = screen.getByText('23 days ago')
    expect(late).toHaveClass('late')
    expect(
      screen.getByText('Three weeks quiet. Still playing it?'),
    ).toBeInTheDocument()
    const buttons = screen.getAllByRole('button')
    expect(
      buttons.map((b) => b.textContent.replace(/: Hades II$/, '')),
    ).toEqual(['Pause', 'Finished it', 'Not tonight'])
    expect(buttons[0]).toHaveClass('primary')
    await userEvent.click(buttons[0])
    expect(onWrapUp).toHaveBeenLastCalledWith(expect.anything(), 'paused')
    await userEvent.click(buttons[1])
    expect(onWrapUp).toHaveBeenLastCalledWith(expect.anything(), 'finished')
  })
})
