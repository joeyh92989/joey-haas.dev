import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import IsbnField from './IsbnField.jsx'

vi.mock('./BarcodeScanner.jsx', () => ({
  default: ({ open, onScan }) =>
    open ? (
      <button type="button" onClick={() => onScan('9781607066019')}>
        fake scan
      </button>
    ) : null,
}))

const SAGA = '9781607066019'
const BLANK = { kind: '', label: '', from: '', to: '', isbn: '' }

function Harness({ start = BLANK, spy }) {
  const [row, setRow] = useState(start)
  return (
    <MemoryRouter>
      <IsbnField
        row={row}
        name="book 1"
        onChange={(next) => {
          spy?.(next)
          setRow(next)
        }}
      />
      <output data-testid="label">{row.label}</output>
    </MemoryRouter>
  )
}

function answer(body, status = 200) {
  globalThis.fetch = vi.fn(async () => ({
    ok: status < 400,
    status,
    json: async () => body,
  }))
}

afterEach(() => vi.restoreAllMocks())

const type = (value) =>
  fireEvent.change(screen.getByLabelText('ISBN, book 1'), {
    target: { value },
  })

describe('IsbnField', () => {
  it('looks the ISBN up and fills a blank label', async () => {
    answer({
      found: true,
      isbn: SAGA,
      title: 'Saga',
      subtitle: 'Volume One',
      volume_number: 1,
      publisher: 'Image Comics',
      year: 2012,
      pages: 160,
      cover_url: 'https://covers.openlibrary.org/b/id/1-M.jpg',
      on_shelf: [],
    })
    render(<Harness />)
    type('978-1-60706-601-9')
    fireEvent.click(screen.getByRole('button', { name: /Look up/ }))
    await waitFor(() =>
      expect(screen.getByTestId('label')).toHaveTextContent('Vol. 1'),
    )
    expect(globalThis.fetch.mock.calls[0][0]).toContain(
      `/api/intake/isbn/${SAGA}`,
    )
    expect(screen.getByText(/Image Comics/)).toBeInTheDocument()
  })

  it('does not ask the server about a bad ISBN', () => {
    answer({})
    render(<Harness />)
    type('9781607066010')
    fireEvent.click(screen.getByRole('button', { name: /Look up/ }))
    expect(screen.getByText(/not a valid ISBN/)).toBeInTheDocument()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('keeps typed text and the ISBN on a miss', async () => {
    answer({ found: false, reason: 'not_found', isbn: SAGA, on_shelf: [] })
    render(<Harness start={{ ...BLANK, label: 'Mine', isbn: SAGA }} />)
    fireEvent.click(screen.getByRole('button', { name: /Look up/ }))
    expect(await screen.findByText(/No book found/)).toBeInTheDocument()
    expect(screen.getByTestId('label')).toHaveTextContent('Mine')
    expect(screen.getByLabelText('ISBN, book 1')).toHaveValue(SAGA)
  })

  it('says so when the server does not answer, and keeps the row', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline')
    })
    render(<Harness start={{ ...BLANK, isbn: SAGA }} />)
    fireEvent.click(screen.getByRole('button', { name: /Look up/ }))
    expect(
      await screen.findByText(/The server did not answer/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('ISBN, book 1')).toHaveValue(SAGA)
  })

  it('warns when the shelf already holds it, and links the book', async () => {
    answer({
      found: false,
      reason: 'unavailable',
      isbn: SAGA,
      on_shelf: [{ item_id: 'abc', title: 'Saga', volume_slug: 'vol-1' }],
    })
    render(<Harness start={{ ...BLANK, isbn: SAGA }} />)
    fireEvent.click(screen.getByRole('button', { name: /Look up/ }))
    const link = await screen.findByRole('link', { name: 'Saga' })
    expect(link).toHaveAttribute('href', '/admin/shelf/comics/abc/vol-1')
    expect(screen.getByText(/Already on your shelf/)).toBeInTheDocument()
  })

  it('fills the box from a scan and looks it up', async () => {
    answer({ found: false, reason: 'not_found', isbn: SAGA, on_shelf: [] })
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /Scan the barcode/ }))
    fireEvent.click(screen.getByText('fake scan'))
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(screen.getByLabelText('ISBN, book 1')).toHaveValue(SAGA)
  })
})
