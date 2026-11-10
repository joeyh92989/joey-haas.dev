import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

// The build found an empty comics snapshot (#125).
vi.mock('../lib/snapshotPresence.js', () => ({
  hasComics: false,
  hasSpots: true,
}))

const { default: SpineTabs } = await import('./SpineTabs.jsx')

function renderTabs(props) {
  return render(
    <MemoryRouter initialEntries={['/shelf']}>
      <SpineTabs {...props} />
    </MemoryRouter>,
  )
}

describe('SpineTabs', () => {
  it('leaves Comics out when the build says there are none', () => {
    renderTabs()
    expect(screen.queryByRole('link', { name: 'Comics' })).toBeNull()
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(
      ['Collection', 'What’s next', 'Year in review', 'How it works', 'Daily'],
    )
  })

  it('shows Comics when told to', () => {
    renderTabs({ comics: true })
    expect(screen.getByRole('link', { name: 'Comics' })).toHaveAttribute(
      'href',
      '/shelf/comics',
    )
  })
})
