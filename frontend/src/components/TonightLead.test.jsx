import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import TonightLead from './TonightLead.jsx'
import { spine } from '../content/spine.js'

const copy = spine.next.tonight

const PICK = {
  item_id: 'p1',
  type: 'game',
  title: 'Octopath Traveler II',
  cover_url: null,
  platform: 'Nintendo Switch',
  slot_label: 'Best fit',
  time_to_beat_hours: 45,
  reasons: ['First reason', 'Second reason', 'Third reason'],
}

function renderLead(props) {
  return render(
    <MemoryRouter>
      <TonightLead pick={PICK} pinned={false} {...props} />
    </MemoryRouter>,
  )
}

describe('TonightLead', () => {
  it('shows the slot, title link, platform, size and two reasons', () => {
    renderLead()
    expect(screen.getByText('Best fit')).toHaveClass('pick-slot')
    expect(
      screen.getByRole('link', { name: 'Octopath Traveler II' }),
    ).toHaveAttribute('href', '/shelf/p1/')
    expect(screen.getByText('Nintendo Switch')).toBeInTheDocument()
    expect(screen.getByText('Long')).toHaveClass('size-pill')
    expect(screen.getByText('about 45 h to finish')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(
      ['First reason', 'Second reason'],
    )
  })

  it('renders no buttons signed out', () => {
    renderLead()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers Play this tonight and Not tonight, beside the link', async () => {
    const onPlay = vi.fn()
    const onSkip = vi.fn()
    renderLead({ signedIn: true, onPlay, onSkip })
    const link = screen.getByRole('link', { name: 'Octopath Traveler II' })
    const play = screen.getByRole('button', { name: copy.play })
    expect(link).not.toContainElement(play)
    await userEvent.click(play)
    expect(onPlay).toHaveBeenCalledWith(PICK)
    await userEvent.click(screen.getByRole('button', { name: copy.skip }))
    expect(onSkip).toHaveBeenCalledWith(PICK)
  })

  it('pinned, reads Up next and offers only Unpin', async () => {
    const onUnpin = vi.fn()
    const { container } = renderLead({ pinned: true, signedIn: true, onUnpin })
    expect(container.querySelector('.tonight-lead')).toHaveClass('pinned')
    expect(screen.getAllByText(spine.next.upNext)).toHaveLength(2)
    expect(screen.queryByText('Best fit')).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: copy.unpin }))
    expect(onUnpin).toHaveBeenCalledWith(PICK)
  })

  it('shows no size for a game without a time to beat', () => {
    renderLead({ pick: { ...PICK, time_to_beat_hours: null } })
    expect(screen.queryByText(/to finish/)).toBeNull()
  })
})
