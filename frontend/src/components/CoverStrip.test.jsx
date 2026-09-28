import '@testing-library/jest-dom'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readSnapshot } from '../lib/snapshot.js'
import CoverStrip from './CoverStrip.jsx'

vi.mock('../lib/snapshot.js', () => ({ readSnapshot: vi.fn() }))

const favourite = (id, rating) => ({
  id,
  type: 'game',
  title: id,
  cover_url: `https://images.igdb.com/${id}.jpg`,
  favorite: true,
  rating,
})

beforeEach(() => {
  vi.mocked(readSnapshot).mockReset()
})

describe('CoverStrip', () => {
  it('shows four favourite covers, highest rated first, as decoration', async () => {
    vi.mocked(readSnapshot).mockResolvedValue([
      favourite('low', 6),
      favourite('top', 10),
      favourite('mid', 8),
      favourite('high', 9),
      favourite('lowest', 5),
      { ...favourite('plain', 10), favorite: false },
    ])
    const { container } = render(<CoverStrip />)

    await waitFor(() =>
      expect(container.querySelectorAll('.cover-strip img')).toHaveLength(4),
    )
    const sources = [...container.querySelectorAll('.cover-strip img')].map(
      (img) => img.getAttribute('src'),
    )
    expect(sources).toEqual([
      'https://images.igdb.com/top.jpg',
      'https://images.igdb.com/high.jpg',
      'https://images.igdb.com/mid.jpg',
      'https://images.igdb.com/low.jpg',
    ])
    expect(container.querySelector('.cover-strip')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(readSnapshot).toHaveBeenCalledWith('items')
  })

  it('renders nothing without a snapshot', async () => {
    vi.mocked(readSnapshot).mockResolvedValue(null)
    const { container } = render(<CoverStrip />)
    await waitFor(() => expect(readSnapshot).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when nothing is a favourite', async () => {
    vi.mocked(readSnapshot).mockResolvedValue([
      { ...favourite('plain', 9), favorite: false },
    ])
    const { container } = render(<CoverStrip />)
    await waitFor(() => expect(readSnapshot).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
