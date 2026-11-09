import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import NowPlaying from './NowPlaying.jsx'

const game = (title, fields = {}) => ({
  id: title,
  type: 'game',
  title,
  status: 'active',
  cover_url: null,
  ...fields,
})

function renderBand(items) {
  return render(
    <MemoryRouter>
      <NowPlaying items={items} linkFor={(item) => `/shelf/${item.id}/`} />
    </MemoryRouter>,
  )
}

describe('NowPlaying', () => {
  it('renders nothing when nothing is being played', () => {
    const { container } = renderBand([game('Done', { status: 'finished' })])
    expect(container).toBeEmptyDOMElement()
  })

  it('names the band and links each game', () => {
    renderBand([
      game('Hollow', {
        platform: 'Nintendo Switch 2',
        playing_since: '2026-11-03',
      }),
    ])
    const band = screen.getByRole('region', { name: 'Now playing' })
    const link = screen.getByRole('link', { name: /Hollow/ })
    expect(band).toContainElement(link)
    expect(link).toHaveAttribute('href', '/shelf/Hollow/')
    expect(link).toHaveTextContent('Nintendo Switch 2')
    expect(link).toHaveTextContent('Playing since Nov 3, 2026')
  })

  it('leaves the date out when the start is unknown', () => {
    renderBand([game('Undated')])
    expect(screen.getByRole('link', { name: /Undated/ })).not.toHaveTextContent(
      'Playing since',
    )
  })
})

describe('NowPlaying with Wrap up', () => {
  it('renders the button only when asked, as a sibling of the link', async () => {
    const onWrapUp = vi.fn()
    render(
      <MemoryRouter>
        <NowPlaying
          items={[game('Hollow')]}
          linkFor={(item) => `/admin/collection/${item.id}`}
          onWrapUp={onWrapUp}
        />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: /Hollow/ })
    const button = screen.getByRole('button', { name: 'Wrap up: Hollow' })
    expect(link.contains(button)).toBe(false)
    await userEvent.click(button)
    expect(onWrapUp).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'Hollow' }),
    )
  })

  it('has no button on the public band', () => {
    renderBand([game('Hollow')])
    expect(screen.queryByRole('button')).toBeNull()
  })
})
