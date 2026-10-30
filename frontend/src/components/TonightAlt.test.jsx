import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import TonightAlt from './TonightAlt.jsx'
import { spine } from '../content/spine.js'

const copy = spine.next.tonight

const PICK = {
  item_id: 'p2',
  type: 'game',
  title: 'A Short Hike',
  cover_url: null,
  platform: 'Nintendo Switch',
  slot_label: 'Change of pace',
  time_to_beat_hours: 3,
  reasons: ['About 3 h to finish, after 62 h of Xenoblade', 'Second'],
}

function renderAlt(props) {
  return render(
    <MemoryRouter>
      <ul>
        <TonightAlt pick={PICK} {...props} />
      </ul>
    </MemoryRouter>,
  )
}

describe('TonightAlt', () => {
  it('shows the slot, the title link, the size and the first reason only', () => {
    renderAlt()
    expect(screen.getByText('Change of pace')).toHaveClass('pick-slot')
    expect(screen.getByRole('link', { name: 'A Short Hike' })).toHaveAttribute(
      'href',
      '/shelf/p2/',
    )
    expect(screen.getByText('Short')).toHaveClass('size-pill')
    expect(
      screen.getByText('About 3 h to finish, after 62 h of Xenoblade'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Second')).toBeNull()
  })

  it('takes a label over the pick’s own, or none', () => {
    const { unmount } = renderAlt({ label: spine.next.upNext })
    expect(screen.getByText(spine.next.upNext)).toBeInTheDocument()
    expect(screen.queryByText('Change of pace')).toBeNull()
    unmount()
    renderAlt({ pick: { ...PICK, slot_label: null } })
    expect(document.querySelector('.pick-slot')).toBeNull()
  })

  it('renders no buttons without handlers', () => {
    renderAlt()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers Play this instead and Not tonight', async () => {
    const onPlay = vi.fn()
    const onSkip = vi.fn()
    renderAlt({ onPlay, onSkip })
    await userEvent.click(
      screen.getByRole('button', { name: copy.playInstead }),
    )
    expect(onPlay).toHaveBeenCalledWith(PICK)
    await userEvent.click(screen.getByRole('button', { name: copy.skip }))
    expect(onSkip).toHaveBeenCalledWith(PICK)
  })
})
