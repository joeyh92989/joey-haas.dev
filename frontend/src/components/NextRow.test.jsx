import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import NextRow from './NextRow.jsx'

const BASE = {
  title: 'Ratatan',
  platform: 'Nintendo Switch 2',
  physical_format: 'game_card',
  release_date: '2026-10-15',
  release_precision: 'day',
  cover_url: null,
  igdb_url: 'https://www.igdb.com/games/ratatan',
  reasons: ['IGDB lists it beside Hades ♥', 'second', 'third'],
  top_pick: true,
  new: true,
  item_id: null,
}

function renderRow(props) {
  return render(
    <MemoryRouter>
      <ul>
        <NextRow row={BASE} section="preorders" {...props} />
      </ul>
    </MemoryRouter>,
  )
}

describe('NextRow', () => {
  it('shows meta, two reasons and the badges', () => {
    renderRow()
    expect(
      screen.getByText(
        /Nintendo Switch 2 · Full game on cartridge · Out Oct 15, 2026/,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/IGDB lists it beside Hades/)).toBeInTheDocument()
    expect(screen.getByText('second')).toBeInTheDocument()
    expect(screen.queryByText('third')).toBeNull()
    expect(screen.getByText('New')).toBeInTheDocument()
    expect(screen.getByText('Top pick')).toBeInTheDocument()
  })

  it('links a wanted row to its item page and others to IGDB', () => {
    const { unmount } = renderRow({ row: { ...BASE, item_id: 'abc' } })
    expect(screen.getByRole('link', { name: /Ratatan/ })).toHaveAttribute(
      'href',
      '/spine/abc',
    )
    unmount()
    renderRow()
    expect(screen.getByRole('link', { name: /Ratatan/ })).toHaveAttribute(
      'href',
      BASE.igdb_url,
    )
  })

  it('keeps admin actions outside the link', () => {
    renderRow({ actions: <button type="button">Got it</button> })
    const link = screen.getByRole('link', { name: /Ratatan/ })
    expect(within(link).queryByRole('button')).toBeNull()
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument()
  })

  it('says digital only for a digital lane', () => {
    renderRow({ row: { ...BASE, lane: 'digital', physical_format: null } })
    expect(screen.getByText(/Digital only/)).toBeInTheDocument()
  })
})
