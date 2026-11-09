import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import PickList from './PickList.jsx'
import { itemPath } from '../lib/spinePaths.js'
import { spine } from '../content/spine.js'

const pick = (id, title, fields = {}) => ({
  item_id: id,
  type: 'game',
  title,
  cover_url: null,
  platform: 'Nintendo Switch',
  reasons: [`Reason for ${title}`, 'Second reason'],
  slot_label: 'Best fit',
  time_to_beat_hours: 14,
  ...fields,
})

function renderList(props = {}) {
  return render(
    <MemoryRouter>
      <PickList
        picks={[pick('p1', 'Metroid'), pick('p2', 'Tunic')]}
        {...props}
      />
    </MemoryRouter>,
  )
}

describe('PickList', () => {
  it('lists the picks with kicker, title link, size and the first reason only', () => {
    renderList()
    expect(screen.getByText('Or instead')).toBeInTheDocument()
    expect(screen.getByText(spine.next.tonight.pickedLive)).toBeInTheDocument()
    const rows = [...document.querySelectorAll('.picklist > li')]
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('Best fit')).toBeInTheDocument()
    expect(
      within(rows[0]).getByRole('link', { name: 'Metroid' }),
    ).toHaveAttribute('href', itemPath('p1'))
    expect(within(rows[0]).getByText('Reason for Metroid')).toBeInTheDocument()
    expect(within(rows[0]).queryByText('Second reason')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('puts the pinned game first as Up next', () => {
    renderList({ upNext: pick('u1', 'Pinned', { slot_label: null }) })
    const rows = [...document.querySelectorAll('.picklist > li')]
    expect(within(rows[0]).getByText('Up next')).toBeInTheDocument()
    expect(
      within(rows[0]).getByRole('link', { name: 'Pinned' }),
    ).toBeInTheDocument()
  })

  it('gives the owner Play this instead and Not tonight as siblings of the link', async () => {
    const onPlay = vi.fn()
    const onSkip = vi.fn()
    renderList({ onPlay, onSkip })
    const [first] = document.querySelectorAll('.picklist > li')
    const link = within(first).getByRole('link', { name: 'Metroid' })
    const play = within(first).getByRole('button', {
      name: 'Play this instead: Metroid',
    })
    expect(link.contains(play)).toBe(false)
    await userEvent.click(play)
    expect(onPlay).toHaveBeenCalledWith(
      expect.objectContaining({ item_id: 'p1' }),
    )
    await userEvent.click(
      within(first).getByRole('button', { name: 'Not tonight: Metroid' }),
    )
    expect(onSkip).toHaveBeenCalledWith(
      expect.objectContaining({ item_id: 'p1' }),
    )
  })

  it('shows a skipped row as its toast with Undo', async () => {
    const onUndo = vi.fn()
    renderList({ skipped: ['p2'], onUndo, onPlay: vi.fn(), onSkip: vi.fn() })
    const toast = document.querySelectorAll('.picklist > li')[1]
    expect(toast).toHaveClass('tonight-toast')
    await userEvent.click(
      within(toast).getByRole('button', { name: 'Undo: Tunic' }),
    )
    expect(onUndo).toHaveBeenCalledWith(
      expect.objectContaining({ item_id: 'p2' }),
    )
  })

  it('renders nothing with no rows', () => {
    const { container } = render(
      <MemoryRouter>
        <PickList picks={[]} />
      </MemoryRouter>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
