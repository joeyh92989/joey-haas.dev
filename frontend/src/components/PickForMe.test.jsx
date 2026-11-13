import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import PickForMe from './PickForMe.jsx'
import { spine } from '../content/spine.js'

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
    .queryAllByRole('listitem')
    .filter((li) => li.classList.contains('tonight-alt'))
    .map((li) => li.querySelector('.tonight-title').textContent)
}

describe('PickForMe', () => {
  it('shows no result until a length or a mood is chosen', async () => {
    const user = userEvent.setup()
    renderBand()
    expect(screen.getByRole('radio', { name: /Any length/ })).not.toBeChecked()
    expect(titles()).toEqual([])
    expect(document.querySelector('.pick-empty')).toHaveTextContent(
      spine.next.pickForMe.choose,
    )
    await user.click(screen.getByRole('button', { name: 'Cozy' }))
    expect(document.querySelector('.pick-empty')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Cozy' }))
    expect(document.querySelector('.pick-empty')).toHaveTextContent(
      spine.next.pickForMe.choose,
    )
    expect(titles()).toEqual([])
    // The scoring line is about a result; with none it stays out.
    expect(screen.queryByText(/no model call/)).not.toBeInTheDocument()
  })

  it('shows each pick’s working once a length is chosen', async () => {
    renderBand()
    await userEvent.click(screen.getByRole('radio', { name: /Any length/ }))
    expect(titles()).toEqual(['Alpha', 'Beta', 'Gamma'])
    const first = screen.getByRole('link', { name: 'Alpha' }).closest('li')
    expect(within(first).getByText('88')).toBeInTheDocument()
    expect(within(first).getByText(/Taste/)).toHaveTextContent('weight 30')
    expect(within(first).getByText('82')).toBeInTheDocument()
    expect(screen.getByText(/no model call/)).toBeInTheDocument()
  })

  it('leaves out Tonight’s lead, says so, and still shows three', async () => {
    const four = {
      ...TABLE,
      games: { ...TABLE.games, d: card('d', 'Delta') },
      combos: {
        'any|': [
          score('a', 88),
          score('b', 70),
          score('c', 61),
          score('d', 50),
        ],
      },
    }
    render(
      <MemoryRouter>
        <PickForMe table={four} lead={{ id: 'a', title: 'Alpha' }} />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('radio', { name: /Any length/ }))
    expect(titles()).toEqual(['Beta', 'Gamma', 'Delta'])
    expect(
      screen.getByText(/Tonight’s pick, Alpha, is left out\./),
    ).toBeInTheDocument()
  })

  it('names no lead when it is not among the shown picks', async () => {
    const four = {
      ...TABLE,
      games: { ...TABLE.games, d: card('d', 'Delta') },
      combos: {
        'any|': [
          score('a', 88),
          score('b', 70),
          score('c', 61),
          score('d', 50),
        ],
      },
    }
    render(
      <MemoryRouter>
        <PickForMe table={four} lead={{ id: 'z', title: 'Zeta' }} />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('radio', { name: /Any length/ }))
    expect(titles()).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(screen.queryByText(/is left out/)).toBeNull()
  })

  it('says so again when the last choice is cleared', async () => {
    const user = userEvent.setup()
    renderBand()
    await user.click(screen.getByRole('button', { name: 'Cozy' }))
    await user.click(screen.getByRole('button', { name: 'Cozy' }))
    const live = document.querySelector('[role="status"][aria-live="polite"]')
    expect(live).toHaveTextContent(spine.next.pickForMe.choose)
  })

  it('shows at most three, and no note without a lead', async () => {
    const four = {
      ...TABLE,
      games: { ...TABLE.games, d: card('d', 'Delta') },
      combos: {
        'any|': [
          score('a', 88),
          score('b', 70),
          score('c', 61),
          score('d', 50),
        ],
      },
    }
    render(
      <MemoryRouter>
        <PickForMe table={four} />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('radio', { name: /Any length/ }))
    expect(titles()).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(screen.queryByText(/is left out/)).toBeNull()
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
    expect(document.querySelector('.pick-note')).toHaveTextContent(
      'Two moods at most',
    )
    await user.click(screen.getByRole('button', { name: 'Story' }))
    expect(document.querySelector('.pick-note')).toHaveTextContent('')
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
