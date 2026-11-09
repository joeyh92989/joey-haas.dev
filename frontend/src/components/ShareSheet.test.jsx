import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ShareSheet from './ShareSheet.jsx'
import { axeViolations } from '../lib/axe.test-util.js'

const TEXT = [
  'Shelfle 37 · 3/6',
  '⬛🟨🟩🟨',
  '🟩🟩🟩🟩',
  'joey-haas.dev/daily',
].join('\n')
const WORDS = [
  'Row 1: platform no, year close (later), genre match, size close (shorter)',
  'Row 2: platform match, year match, genre match, size match',
]

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
  delete navigator.clipboard
  vi.restoreAllMocks()
})

// jsdom has no clipboard; the sheet sees whatever this defines (user-event
// is not used here, since its setup installs a clipboard stub of its own).
function stubClipboard(writeText) {
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText ? { writeText } : undefined,
    configurable: true,
    writable: true,
  })
}

function renderSheet(open = true) {
  const onClose = vi.fn()
  const onStatus = vi.fn()
  const utils = render(
    <ShareSheet
      open={open}
      onClose={onClose}
      text={TEXT}
      words={WORDS}
      onStatus={onStatus}
    />,
  )
  return { ...utils, onClose, onStatus }
}

async function click(element) {
  await act(async () => {
    fireEvent.click(element)
  })
}

describe('ShareSheet', () => {
  it('shows the board, the words and copies the exact text', async () => {
    const writeText = vi.fn(async () => {})
    stubClipboard(writeText)
    const { container, onStatus } = renderSheet()
    const dialog = screen.getByRole('dialog', { name: 'Share today’s result' })
    expect(dialog).toHaveAttribute('open')
    expect(dialog.querySelector('.share-grid')).toHaveTextContent(
      'Shelfle 37 · 3/6',
    )
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(
      WORDS,
    )
    await click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith(TEXT)
    expect(onStatus).toHaveBeenCalledWith('Copied.')
    expect(await axeViolations(container)).toEqual([])
  })

  it('falls back to a selectable textarea when the clipboard is missing', async () => {
    stubClipboard(null)
    const { onStatus } = renderSheet()
    await click(screen.getByRole('button', { name: 'Copy' }))
    expect(screen.getByRole('textbox')).toHaveValue(TEXT)
    expect(screen.getByText(/Copying is blocked here/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
    expect(onStatus).not.toHaveBeenCalled()
  })

  it('falls back when the clipboard refuses', async () => {
    stubClipboard(
      vi.fn(async () => {
        throw new Error('denied')
      }),
    )
    renderSheet()
    await click(screen.getByRole('button', { name: 'Copy' }))
    expect(screen.getByRole('textbox')).toHaveValue(TEXT)
  })

  it('closes through the owner on Close, Escape and the backdrop', async () => {
    const { onClose } = renderSheet()
    const dialog = screen.getByRole('dialog')
    await click(screen.getByRole('button', { name: 'Close' }))
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    fireEvent.pointerDown(dialog)
    fireEvent.click(dialog)
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('renders nothing while closed', () => {
    renderSheet(false)
    expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute(
      'open',
    )
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
  })
})
