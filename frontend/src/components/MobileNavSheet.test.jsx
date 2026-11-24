import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { moreItems } from '../lib/navMore.js'
import MobileNavSheet from './MobileNavSheet.jsx'

const ITEMS = [
  { to: '/', label: 'Home', end: true },
  { to: '/shelf', label: 'My Shelf', also: ['/daily'] },
]

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})

function renderSheet(path, flags) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MobileNavSheet
        open
        onClose={() => {}}
        items={ITEMS}
        more={moreItems(flags)}
        returnFocusRef={{ current: null }}
      />
    </MemoryRouter>,
  )
}

describe('MobileNavSheet More group', () => {
  it('lists the More pages in a labelled group under the nav, before Resume', () => {
    renderSheet('/', { hasNotes: true })
    const group = screen.getByRole('group', { name: 'More' })
    expect(
      within(group)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Now', 'Stats', 'TIL', 'Daily game', 'Colophon'])
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
    const resume = screen.getByRole('link', { name: 'Resume (PDF)' })
    expect(
      group.compareDocumentPosition(resume) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('drops TIL while absent', () => {
    renderSheet('/', { hasNotes: false })
    const group = screen.getByRole('group', { name: 'More' })
    expect(
      within(group)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Now', 'Stats', 'Daily game', 'Colophon'])
  })

  it('marks the current More page', () => {
    renderSheet('/stats', { hasNotes: true })
    expect(screen.getByRole('link', { name: 'Stats' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
