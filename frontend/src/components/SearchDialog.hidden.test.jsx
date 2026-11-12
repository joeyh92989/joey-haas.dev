import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SearchDialog from './SearchDialog.jsx'

vi.mock('../content/posts.js', () => ({ posts: [] }))
// A build whose spots snapshot is empty (#183).
vi.mock('../lib/snapshotPresence.js', () => ({ hiddenPaths: ['/denver'] }))

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no index')))
})

afterEach(() => {
  delete HTMLDialogElement.prototype.showModal
  vi.unstubAllGlobals()
})

describe('SearchDialog with an empty Denver', () => {
  it('does not offer the Denver page', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <SearchDialog open onClose={() => {}} />
      </MemoryRouter>,
    )
    await user.type(screen.getByRole('combobox', { name: 'Search' }), 'denver')
    const pages = screen.getByRole('group', { name: 'Pages' })
    // Other pages still match ("Denver" is in Home's description).
    expect(
      within(pages).getByRole('option', { name: /^Home/ }),
    ).toBeInTheDocument()
    expect(within(pages).queryByRole('option', { name: /^Denver/ })).toBeNull()
  })
})
