import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PlayJournal from './PlayJournal.jsx'

const ROW = {
  id: 's1',
  item_id: 'i1',
  played_on: '2026-10-01',
  minutes: 90,
  note: 'boss three',
}

function stubApi(rows) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method ?? 'GET', options })
      if (options.method === 'POST') {
        const body = JSON.parse(options.body)
        rows.unshift({ id: 's2', item_id: 'i1', ...body })
        return { ok: true, status: 201, json: async () => rows[0] }
      }
      if (options.method === 'DELETE') {
        return { ok: true, status: 204, json: async () => null }
      }
      return { ok: true, status: 200, json: async () => [...rows] }
    }),
  )
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PlayJournal', () => {
  it('lists the sessions already logged, note included', async () => {
    stubApi([ROW])
    render(<PlayJournal itemId="i1" />)
    expect(await screen.findByText('Oct 1, 2026')).toBeInTheDocument()
    expect(screen.getByText(/90 min/)).toBeInTheDocument()
    expect(screen.getByText(/boss three/)).toBeInTheDocument()
  })

  it('logs a session with the minutes and note typed', async () => {
    const calls = stubApi([])
    render(<PlayJournal itemId="i1" />)
    await screen.findByText('No sessions logged yet.')

    await userEvent.type(screen.getByLabelText('Minutes'), '45')
    await userEvent.type(screen.getByLabelText('Note (private)'), 'chapter 2')
    await userEvent.click(screen.getByRole('button', { name: 'Log a session' }))

    const post = calls.find((call) => call.method === 'POST')
    expect(post.url).toContain('/api/items/i1/sessions')
    expect(JSON.parse(post.options.body)).toMatchObject({
      minutes: 45,
      note: 'chapter 2',
    })
    await waitFor(() =>
      expect(screen.getByLabelText('Minutes')).toHaveValue(null),
    )
  })

  it('deletes a session', async () => {
    const calls = stubApi([ROW])
    render(<PlayJournal itemId="i1" />)
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Delete the session on Oct 1, 2026',
      }),
    )
    expect(calls.some((call) => call.method === 'DELETE')).toBe(true)
    expect(
      await screen.findByText('No sessions logged yet.'),
    ).toBeInTheDocument()
  })
})
