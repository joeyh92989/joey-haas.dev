import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import UnfinishedList from './UnfinishedList.jsx'

const entries = (counts) => ({
  reading: 0,
  exact: 0,
  probable: 0,
  check: 0,
  owned: 0,
  ready: 0,
  ignored: 0,
  typed: 0,
  ...counts,
})

const SITTING = {
  id: 's1',
  area: 'shelf',
  kind: 'comic',
  label: 'Longbox 1',
  step: 'check',
  photos: 6,
  photos_waiting: 1,
  entries: entries({ exact: 29, ready: 2, check: 7, reading: 2, owned: 3 }),
  created_at: '2026-11-11T02:42:00Z',
  updated_at: '2026-11-10T19:42:00Z',
}

const KINDS = { comic: { key: 'comic', label: 'Comic' } }

function renderList(props = {}) {
  return render(
    <MemoryRouter>
      <UnfinishedList
        sittings={[SITTING]}
        kinds={KINDS}
        base="/admin/collection/add"
        onDiscard={() => {}}
        {...props}
      />
    </MemoryRouter>,
  )
}

describe('UnfinishedList', () => {
  it('says nothing is unfinished when nothing is', () => {
    renderList({ sittings: [] })
    expect(screen.getByText('Nothing unfinished')).toBeInTheDocument()
  })

  it('shows each sitting with its counts and a Resume link', () => {
    renderList()
    const row = screen.getByRole('listitem')
    expect(row).toHaveTextContent('Longbox 1')
    expect(row).toHaveTextContent('Comic')
    expect(row).toHaveTextContent('6 photos')
    expect(row).toHaveTextContent('7 to check, 31 ready, 3 still reading')
    expect(row).toHaveTextContent('3 already on the shelf')
    expect(
      within(row).getByRole('link', { name: 'Resume Longbox 1' }),
    ).toHaveAttribute('href', '/admin/collection/add/s1')
  })

  it('labels each segment of the three-part meter', () => {
    renderList()
    const meter = screen.getByRole('group', { name: 'Progress of Longbox 1' })
    expect(
      within(meter)
        .getAllByRole('img')
        .map((segment) => segment.getAttribute('aria-label')),
    ).toEqual(['31 ready', '7 to check', '3 still reading'])
  })

  it('asks once before discarding', async () => {
    const onDiscard = vi.fn()
    renderList({ onDiscard })
    await userEvent.click(
      screen.getByRole('button', { name: 'Discard Longbox 1' }),
    )
    expect(onDiscard).not.toHaveBeenCalled()
    expect(
      screen.getByText(/Its 6 photos and 43 entries go with it/),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(onDiscard).not.toHaveBeenCalled()
    await userEvent.click(
      screen.getByRole('button', { name: 'Discard Longbox 1' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Yes, discard' }))
    expect(onDiscard).toHaveBeenCalledWith(SITTING)
  })

  it('names an unlabelled mixed sitting', () => {
    renderList({ sittings: [{ ...SITTING, kind: null, label: null }] })
    expect(screen.getByRole('listitem')).toHaveTextContent('Untitled sitting')
    expect(screen.getByRole('listitem')).toHaveTextContent('Mixed shelf')
  })

  it('tells two same-label sittings apart by when each began', () => {
    renderList({
      sittings: [
        SITTING,
        { ...SITTING, id: 's2', created_at: '2026-11-12T04:05:00Z' },
      ],
    })
    expect(screen.getByText(/started Nov 10, 7:42 PM/)).toBeInTheDocument()
    expect(screen.getByText(/started Nov 11, 9:05 PM/)).toBeInTheDocument()
  })
})
