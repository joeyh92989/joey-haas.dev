import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SearchDialog from './SearchDialog.jsx'

vi.mock('../content/posts.js', () => ({ posts: [] }))
// A build with a page hidden (#183).
vi.mock('../lib/snapshotPresence.js', () => ({ hiddenPaths: ['/daily'] }))

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

describe('SearchDialog with a hidden page', () => {
  it('does not offer the hidden page', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <SearchDialog open onClose={() => {}} />
      </MemoryRouter>,
    )
    await user.type(screen.getByRole('combobox', { name: 'Search' }), 'game')
    const pages = screen.getByRole('group', { name: 'Pages' })
    // Other pages still match ("game" is in Home's description).
    expect(
      within(pages).getByRole('option', { name: /^Home/ }),
    ).toBeInTheDocument()
    expect(
      within(pages).queryByRole('option', { name: /^Daily game/ }),
    ).toBeNull()
  })
})
