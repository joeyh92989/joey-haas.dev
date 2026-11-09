import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import PickForMe from './PickForMe.jsx'

function card(id, title) {
  return {
    item_id: id,
    title,
    cover_url: null,
    platform: 'Nintendo Switch',
    time_to_beat_hours: 4,
    igdb_url: null,
    reasons: [`${title} reason`],
  }
}

function score(id, total) {
  return {
    item_id: id,
    score: total,
    terms: { affinity: 82.4, similarity: 60, quality: 91, length_fit: 100 },
  }
}

const TABLE = {
  generated_on: '2026-11-08',
  weights: { affinity: 30, similarity: 25, quality: 20, length_fit: 15 },
  games: { a: card('a', 'Alpha'), b: card('b', 'Beta'), c: card('c', 'Gamma') },
  combos: {
    'any|': [score('a', 88), score('b', 70), score('c', 61)],
    'short|': [score('b', 75)],
    'short|cozy': [score('c', 66)],
    'short|cozy+story': [],
  },
}

function renderBand(path = '/shelf/next') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PickForMe table={TABLE} />
    </MemoryRouter>,
  )
}

function titles() {
  return screen
    .getAllByRole('listitem')
    .filter((li) => li.classList.contains('tonight-alt'))
    .map((li) => li.querySelector('.tonight-title').textContent)
}

describe('PickForMe', () => {
  it('opens on any length and no mood, with each pick’s working shown', () => {
    renderBand()
    expect(screen.getByRole('radio', { name: /Any length/ })).toBeChecked()
    expect(titles()).toEqual(['Alpha', 'Beta', 'Gamma'])
    const first = screen.getByRole('link', { name: 'Alpha' }).closest('li')
    expect(within(first).getByText('88')).toBeInTheDocument()
    expect(within(first).getByText(/Taste/)).toHaveTextContent('weight 30')
    expect(within(first).getByText('82')).toBeInTheDocument()
    expect(screen.getByText(/no model call/)).toBeInTheDocument()
  })

  it('looks a size and moods up, and announces only after a change', async () => {
    const user = userEvent.setup()
    renderBand()
    const live = document.querySelector('[aria-live="polite"]')
    expect(live).toHaveTextContent('')
    await user.click(screen.getByRole('radio', { name: /Short/ }))
    expect(titles()).toEqual(['Beta'])
    expect(live).toHaveTextContent('One pick for short')
    await user.click(screen.getByRole('button', { name: 'Cozy' }))
    expect(screen.getByRole('button', { name: 'Cozy' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(titles()).toEqual(['Gamma'])
    expect(live).toHaveTextContent('One pick for short, cozy')
  })

  it('says so when nothing fits', async () => {
    const user = userEvent.setup()
    renderBand()
    await user.click(screen.getByRole('radio', { name: /Short/ }))
    await user.click(screen.getByRole('button', { name: 'Story' }))
    await user.click(screen.getByRole('button', { name: 'Cozy' }))
    expect(screen.getByText(/Nothing on my backlog fits/)).toBeInTheDocument()
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(
      'No picks for short, story or cozy',
    )
  })

  it('refuses a third mood with a note and keeps the two', async () => {
    const user = userEvent.setup()
    renderBand()
    await user.click(screen.getByRole('button', { name: 'Cozy' }))
    await user.click(screen.getByRole('button', { name: 'Story' }))
    await user.click(screen.getByRole('button', { name: 'Action' }))
    expect(screen.getByRole('button', { name: 'Action' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('status')).toHaveTextContent('Two moods at most')
    await user.click(screen.getByRole('button', { name: 'Story' }))
    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('takes focus when it is arrived at by its anchor', () => {
    renderBand('/shelf/next#pick-for-me')
    expect(screen.getByRole('heading', { name: 'Pick for me' })).toHaveFocus()
  })

  it('leaves focus alone otherwise', () => {
    renderBand()
    expect(
      screen.getByRole('heading', { name: 'Pick for me' }),
    ).not.toHaveFocus()
  })
})
