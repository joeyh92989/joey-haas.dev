import '@testing-library/jest-dom'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import { resetIndexCache } from '../lib/searchIndex.js'
import SearchButton from './SearchButton.jsx'
import SearchDialog from './SearchDialog.jsx'

vi.mock('../content/posts.js', () => ({ posts: [] }))

const INDEX = {
  entries: [
    {
      g: 'shelf',
      t: 'hades ii',
      s: 'nintendo switch 2 2025',
      title: 'Hades II',
      sub: 'Nintendo Switch 2 · 2025',
      href: '/shelf/a1/',
    },
    {
      g: 'shelf',
      t: 'hollow knight silksong',
      s: '',
      title: 'Hollow Knight: Silksong',
      sub: 'Nintendo Switch 2 · 2025',
      href: '/shelf/a2/',
    },
  ],
}

function Location() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname + location.search}</p>
}

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <SearchButton onOpen={() => setOpen(true)} open={open} />
      <SearchDialog open={open} onClose={() => setOpen(false)} />
      <Location />
    </>
  )
}

function renderHarness() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Harness />
    </MemoryRouter>,
  )
}

function stubIndex(body, ok = true) {
  const fetch = vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(body),
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

async function openWithButton(user) {
  await user.click(screen.getByRole('button', { name: 'Search' }))
  return screen.getByRole('combobox', { name: 'Search' })
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

afterEach(() => {
  delete HTMLDialogElement.prototype.showModal
  delete HTMLDialogElement.prototype.close
  resetIndexCache()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SearchDialog', () => {
  it('opens from the button with focus in the input and the pages listed', async () => {
    stubIndex(INDEX)
    const user = userEvent.setup()
    renderHarness()
    const input = await openWithButton(user)
    expect(input).toHaveFocus()
    const pages = screen.getByRole('group', { name: 'Pages' })
    expect(
      within(pages).getByRole('option', { name: /About/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('group', { name: 'Shelf' }),
    ).not.toBeInTheDocument()
  })

  it('finds a shelf title and lands on its page with Enter', async () => {
    stubIndex(INDEX)
    const user = userEvent.setup()
    renderHarness()
    const input = await openWithButton(user)
    await user.type(input, 'hades')
    await screen.findByRole('option', { name: /Hades II/ })
    await user.keyboard('{Enter}')
    expect(screen.getByTestId('location')).toHaveTextContent('/shelf/a1/')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('moves the highlight with the arrows, wrapping, and reports it', async () => {
    stubIndex(INDEX)
    const user = userEvent.setup()
    renderHarness()
    const input = await openWithButton(user)
    await user.type(input, 'h')
    await screen.findByRole('option', { name: /Silksong/ })
    const options = screen.getAllByRole('option')
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowDown}')
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id)
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      options[options.length - 1].id,
    )
    await user.keyboard('{Enter}')
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/shelf\/a\d\/$/)
  })

  it('announces the result count', async () => {
    stubIndex(INDEX)
    const user = userEvent.setup()
    renderHarness()
    const input = await openWithButton(user)
    await user.type(input, 'hades')
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('1 result'),
    )
  })

  it('closes on Escape and hands focus back to the button', async () => {
    stubIndex(INDEX)
    const user = userEvent.setup()
    renderHarness()
    const button = screen.getByRole('button', { name: 'Search' })
    await openWithButton(user)
    const dialog = document.querySelector('dialog.search-dialog')
    act(() => {
      dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    })
    expect(dialog).not.toHaveAttribute('open')
    expect(button).toHaveFocus()
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on a backdrop click', async () => {
    stubIndex(INDEX)
    const user = userEvent.setup()
    renderHarness()
    const button = screen.getByRole('button', { name: 'Search' })
    await openWithButton(user)
    const dialog = document.querySelector('dialog.search-dialog')
    await user.click(dialog)
    expect(dialog).not.toHaveAttribute('open')
    expect(button).toHaveFocus()
  })

  // Selecting the query and letting go past the panel's edge ends on the
  // backdrop; only a press that started there closes.
  it('stays open when a drag from the input ends on the backdrop', async () => {
    stubIndex(INDEX)
    const user = userEvent.setup()
    renderHarness()
    const input = await openWithButton(user)
    const dialog = document.querySelector('dialog.search-dialog')
    await user.pointer([
      { keys: '[MouseLeft>]', target: input },
      { target: dialog },
      { keys: '[/MouseLeft]', target: dialog },
    ])
    expect(dialog).toHaveAttribute('open')
  })

  // An IME's Enter confirms the composition; it must not pick a result.
  it('ignores Enter while an IME is composing', async () => {
    stubIndex(INDEX)
    const user = userEvent.setup()
    renderHarness()
    const input = await openWithButton(user)
    await user.type(input, 'hades')
    await screen.findByRole('option', { name: /Hades II/ })
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
      )
    })
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('keeps pages working with a note when the index is missing', async () => {
    const fetch = stubIndex(null, false)
    const error = vi.spyOn(console, 'error')
    const user = userEvent.setup()
    renderHarness()
    const input = await openWithButton(user)
    expect(await screen.findByText(/Search is unavailable/)).toBeInTheDocument()
    await user.type(input, 'about')
    expect(screen.getByRole('option', { name: /About/ })).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/search-index.json')
    expect(error).not.toHaveBeenCalled()
  })

  it('offers the shelf search when nothing matches', async () => {
    stubIndex(INDEX)
    const user = userEvent.setup()
    renderHarness()
    const input = await openWithButton(user)
    await user.type(input, 'zzz top')
    expect(screen.getByText(/Nothing for ‘zzz top’/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Search the shelf' }),
    ).toHaveAttribute('href', '/shelf?q=zzz%20top')
    expect(input).not.toHaveAttribute('aria-activedescendant')
  })

  it('passes axe while open with results', async () => {
    stubIndex(INDEX)
    const user = userEvent.setup()
    const { container } = renderHarness()
    const input = await openWithButton(user)
    await user.type(input, 'h')
    await screen.findByRole('option', { name: /Hades II/ })
    expect(await axeViolations(container)).toEqual([])
  })
})
