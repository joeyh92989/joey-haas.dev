import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import LogOutingSheet from './LogOutingSheet.jsx'
import { axeViolations } from '../lib/axe.test-util.js'
import { READ_DEADLINE_MS } from '../lib/waits.js'

// jsdom has no showModal or modal close; these do what the tests need.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
  // Only Date is frozen, so user-event's own timers still run.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 18, 20, 30))
})

afterEach(() => {
  delete HTMLDialogElement.prototype.showModal
  delete HTMLDialogElement.prototype.close
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const json = (body, status = 200) => ({
  ok: status < 300,
  status,
  json: async () => body,
})

const SPOTS = [
  {
    id: 'a1b2c3d4-0000-4000-8000-000000000001',
    name: 'Coors Field',
    neighbourhood: 'LoDo',
    city: 'denver',
    visit_count: 1,
    last_visit: '2026-06-20',
    anchor: false,
    tags: [],
  },
  {
    id: 'a1b2c3d4-0000-4000-8000-000000000002',
    name: 'Chautauqua Park',
    neighbourhood: 'Flatirons',
    city: 'boulder',
    visit_count: 0,
    last_visit: null,
    anchor: false,
    tags: [],
  },
]

const FILLMORE = {
  title: 'Fillmore Auditorium',
  lat: 39.7403,
  lng: -104.9786,
  address: '1510 Clarkson Street, Capitol Hill, Denver',
  category: 'Music venue',
  source_id: 'node/1',
  owned_spot_id: null,
}

/** Answers like the server; `handlers` override by "METHOD path-prefix". */
function stubApi(handlers = {}) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      const path = String(url).replace(/^.*\/api/, '/api')
      const method = options.method ?? 'GET'
      calls.push({
        method,
        path,
        body: options.body && JSON.parse(options.body),
      })
      const key = Object.keys(handlers).find((k) =>
        `${method} ${path}`.startsWith(k),
      )
      if (key) return handlers[key](options)
      if (method === 'GET' && path === '/api/spots') return json(SPOTS)
      if (path.startsWith('/api/intake/search')) {
        return json({ results: [FILLMORE], sources: [] })
      }
      if (method === 'POST' && path === '/api/spots/outings') {
        const body = JSON.parse(options.body)
        const spot = body.spot_id
          ? SPOTS.find((s) => s.id === body.spot_id)
          : { ...SPOTS[0], id: 'new-id', name: body.place.name }
        return json(
          {
            visit: { id: 9, spot_id: spot.id, visited_on: '2026-11-18' },
            spot,
            created: !body.spot_id,
          },
          201,
        )
      }
      return json({}, 404)
    }),
  )
  return calls
}

function Harness({ onSaved = () => {}, onClose = () => {} }) {
  const [open, setOpen] = useState(true)
  return (
    <LogOutingSheet
      open={open}
      onClose={() => {
        onClose()
        setOpen(false)
      }}
      onSaved={onSaved}
    />
  )
}

const searchCalls = (calls) =>
  calls.filter((c) => c.path.startsWith('/api/intake/search'))
const postCall = (calls) =>
  calls.find((c) => c.method === 'POST' && c.path === '/api/spots/outings')

async function openSheet(props) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const view = render(<Harness {...props} />)
  await screen.findByText('Saved spots show as you type', { exact: false })
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
  return { user, view }
}

describe('LogOutingSheet', () => {
  it('typing in the place box filters saved spots and sends no search', async () => {
    const calls = stubApi()
    const { user } = await openSheet()
    await user.type(screen.getByLabelText('Place'), 'coors')
    expect(
      await screen.findByRole('button', { name: /Coors Field/ }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Chautauqua/)).not.toBeInTheDocument()
    expect(searchCalls(calls)).toHaveLength(0)
    expect(postCall(calls)).toBeUndefined()
  })

  it('searches once on Enter and never saves', async () => {
    const calls = stubApi()
    const { user } = await openSheet()
    await user.type(screen.getByLabelText('Place'), 'Fillmore{Enter}')
    expect(
      await screen.findByRole('button', { name: /Fillmore Auditorium/ }),
    ).toBeInTheDocument()
    expect(searchCalls(calls)).toHaveLength(1)
    expect(calls[calls.length - 1].path).toContain('query=Fillmore')
    expect(postCall(calls)).toBeUndefined()
  })

  it('searches from the Search button too', async () => {
    const calls = stubApi()
    const { user } = await openSheet()
    await user.type(screen.getByLabelText('Place'), 'Fillmore')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByRole('button', { name: /Fillmore Auditorium/ })
    expect(searchCalls(calls)).toHaveLength(1)
  })

  it('a result already saved picks the saved spot and posts spot_id', async () => {
    const calls = stubApi({
      'GET /api/intake/search': () =>
        json({
          results: [
            { ...FILLMORE, title: 'Coors Field', owned_spot_id: SPOTS[0].id },
          ],
          sources: [],
        }),
    })
    const onSaved = vi.fn()
    const { user } = await openSheet({ onSaved })
    await user.type(screen.getByLabelText('Place'), 'Coors{Enter}')
    // The saved row also shows while typing; search first, then pick the result.
    await user.click(
      await screen.findByRole('button', { name: /Already saved/ }),
    )
    expect(screen.queryByText('Private')).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('Fine'))
    await user.click(screen.getByRole('button', { name: 'Save outing' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(postCall(calls).body).toEqual({
      spot_id: SPOTS[0].id,
      visited_on: '2026-11-18',
      verdict: 'fine',
    })
  })

  it('a new result shows the private card and posts place with the city', async () => {
    const calls = stubApi()
    const onSaved = vi.fn()
    const onClose = vi.fn()
    const { user } = await openSheet({ onSaved, onClose })
    await user.type(screen.getByLabelText('Place'), 'Fillmore{Enter}')
    await user.click(
      await screen.findByRole('button', { name: /Fillmore Auditorium/ }),
    )
    expect(screen.getByText('Private')).toBeInTheDocument()
    expect(
      screen.getByText(/adds it as a private spot in Denver/),
    ).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('City'), 'boulder')
    expect(screen.getByText(/private spot in Boulder/)).toBeInTheDocument()
    await user.click(screen.getByLabelText('Loved'))
    await user.type(screen.getByLabelText(/Title/), 'Japanese Breakfast')
    await user.click(screen.getByLabelText('Kid came along'))
    await user.type(screen.getByLabelText(/Note/), 'Loud and good.')
    await user.click(screen.getByRole('button', { name: 'Save outing' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(postCall(calls).body).toEqual({
      place: {
        name: 'Fillmore Auditorium',
        lat: 39.7403,
        lng: -104.9786,
        city: 'boulder',
        source_id: 'node/1',
      },
      visited_on: '2026-11-18',
      verdict: 'loved',
      title: 'Japanese Breakfast',
      kid_along: true,
      note: 'Loud and good.',
    })
    expect(onSaved.mock.calls[0][0].created).toBe(true)
    expect(onClose).toHaveBeenCalled()
  })

  it('picks a saved spot from the typed list and posts spot_id; kid and title start empty', async () => {
    const calls = stubApi()
    const { user } = await openSheet()
    expect(screen.getByLabelText(/Title/)).toHaveValue('')
    expect(screen.getByLabelText('Kid came along')).not.toBeChecked()
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-18')
    expect(screen.getByLabelText('Date')).toHaveAttribute('max', '2026-11-19')
    await user.type(screen.getByLabelText('Place'), 'chaut')
    await user.click(await screen.findByRole('button', { name: /Chautauqua/ }))
    await user.click(screen.getByLabelText('Not again'))
    await user.click(screen.getByRole('button', { name: 'Save outing' }))
    await waitFor(() => expect(postCall(calls)).toBeDefined())
    expect(postCall(calls).body).toEqual({
      spot_id: SPOTS[1].id,
      visited_on: '2026-11-18',
      verdict: 'not_again',
    })
  })

  it('requires a place and a verdict', async () => {
    const calls = stubApi()
    const { user } = await openSheet()
    await user.click(screen.getByRole('button', { name: 'Save outing' }))
    expect(await screen.findByText('Pick a place first.')).toBeInTheDocument()
    expect(screen.getByText('Pick a verdict.')).toBeInTheDocument()
    expect(postCall(calls)).toBeUndefined()
  })

  it('says a date over a day ahead is too far, beside the field, and will not save', async () => {
    const calls = stubApi()
    const { user } = await openSheet()
    await user.type(screen.getByLabelText('Place'), 'coors')
    await user.click(await screen.findByRole('button', { name: /Coors Field/ }))
    await user.click(screen.getByLabelText('Fine'))
    const date = screen.getByLabelText('Date')
    await user.clear(date)
    await user.type(date, '2026-11-25')
    expect(screen.getByText(/more than a day ahead/)).toBeInTheDocument()
    expect(date).toHaveAttribute('aria-invalid', 'true')
    await user.click(screen.getByRole('button', { name: 'Save outing' }))
    expect(postCall(calls)).toBeUndefined()
  })

  it('shows the server 422 in the alert and beside the date, keeping the values', async () => {
    stubApi({
      'POST /api/spots/outings': () =>
        json({ detail: 'A visit cannot be in the future' }, 422),
    })
    const onSaved = vi.fn()
    const { user } = await openSheet({ onSaved })
    await user.type(screen.getByLabelText('Place'), 'Fillmore{Enter}')
    await user.click(
      await screen.findByRole('button', { name: /Fillmore Auditorium/ }),
    )
    await user.click(screen.getByLabelText('Loved'))
    await user.type(screen.getByLabelText(/Title/), 'Show')
    await user.click(screen.getByRole('button', { name: 'Save outing' }))
    const alert = await screen.findByText(/Nothing was written/)
    expect(alert).toHaveTextContent(
      'A visit cannot be in the future. Nothing was written: the outing at Fillmore Auditorium was not logged and Fillmore Auditorium was not added to Spots. What you entered is still here.',
    )
    const date = screen.getByLabelText('Date')
    expect(date).toHaveAttribute('aria-invalid', 'true')
    expect(date).toHaveAccessibleDescription('A visit cannot be in the future')
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/Title/)).toHaveValue('Show')
    expect(screen.getByLabelText('Loved')).toBeChecked()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
  })

  it('shows the server title refusal beside the Title field', async () => {
    stubApi({
      'POST /api/spots/outings': () =>
        json({ detail: 'A title is at most 80 characters' }, 422),
    })
    const { user } = await openSheet()
    await user.type(screen.getByLabelText('Place'), 'coors')
    await user.click(await screen.findByRole('button', { name: /Coors Field/ }))
    await user.click(screen.getByLabelText('Fine'))
    await user.click(screen.getByRole('button', { name: 'Save outing' }))
    await screen.findByText(/Nothing was written/)
    const title = screen.getByLabelText(/Title/)
    expect(title).toHaveAttribute('aria-invalid', 'true')
    expect(title).toHaveAccessibleDescription(
      /A title is at most 80 characters/,
    )
  })

  it('typing after a search brings the saved-spot filter back', async () => {
    stubApi()
    const { user } = await openSheet()
    await user.type(screen.getByLabelText('Place'), 'Fillmore{Enter}')
    await screen.findByRole('button', { name: /Fillmore Auditorium/ })
    await user.clear(screen.getByLabelText('Place'))
    await user.type(screen.getByLabelText('Place'), 'coors')
    expect(
      await screen.findByRole('button', { name: /Coors Field/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Fillmore Auditorium/ }),
    ).not.toBeInTheDocument()
  })

  it('a double click on Save posts once', async () => {
    const calls = stubApi({
      'POST /api/spots/outings': () => new Promise(() => {}),
    })
    const { user } = await openSheet()
    await user.type(screen.getByLabelText('Place'), 'coors')
    await user.click(await screen.findByRole('button', { name: /Coors Field/ }))
    await user.click(screen.getByLabelText('Fine'))
    const save = screen.getByRole('button', { name: 'Save outing' })
    fireEvent.click(save)
    fireEvent.click(save)
    await screen.findByRole('button', { name: 'Saving…' })
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
  })

  it('a hung save gives up at the deadline and unlocks the sheet', async () => {
    stubApi({ 'POST /api/spots/outings': () => new Promise(() => {}) })
    const { user } = await openSheet()
    await user.type(screen.getByLabelText('Place'), 'coors')
    await user.click(await screen.findByRole('button', { name: /Coors Field/ }))
    await user.click(screen.getByLabelText('Fine'))
    // Timers are faked from here on, so the deadline can be stepped over.
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date(2026, 10, 18, 20, 30))
    fireEvent.click(screen.getByRole('button', { name: 'Save outing' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(READ_DEADLINE_MS + 1)
    })
    expect(
      screen.getByText(
        /The server did not answer; try again\. Nothing was written/,
      ),
    ).toHaveTextContent('the outing at Coors Field was not logged')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })

  it('shows no want or been line for an already-saved pick when the spots did not load', async () => {
    stubApi({
      'GET /api/spots': () => json({ detail: 'down' }, 500),
      'GET /api/intake/search': () =>
        json({
          results: [
            { ...FILLMORE, title: 'Coors Field', owned_spot_id: SPOTS[0].id },
          ],
          sources: [],
        }),
    })
    const { user } = await openSheet()
    await user.type(screen.getByLabelText('Place'), 'Coors{Enter}')
    await user.click(
      await screen.findByRole('button', { name: /Already saved/ }),
    )
    expect(screen.getByText('Coors Field')).toBeInTheDocument()
    expect(screen.queryByText(/Want|Been/)).not.toBeInTheDocument()
  })

  it('disables the buttons and blocks close while saving', async () => {
    let release
    stubApi({
      'POST /api/spots/outings': () =>
        new Promise((resolve) => {
          release = () =>
            resolve(json({ visit: {}, spot: SPOTS[0], created: false }, 201))
        }),
    })
    const onClose = vi.fn()
    const { user } = await openSheet({ onClose })
    await user.type(screen.getByLabelText('Place'), 'coors')
    await user.click(await screen.findByRole('button', { name: /Coors Field/ }))
    await user.click(screen.getByLabelText('Fine'))
    await user.click(screen.getByRole('button', { name: 'Save outing' }))
    expect(
      await screen.findByRole('button', { name: 'Saving…' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    const dialog = document.querySelector('dialog')
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    expect(onClose).not.toHaveBeenCalled()
    release()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('a failed search says nothing was saved and keeps the box', async () => {
    stubApi({ 'GET /api/intake/search': () => json({ detail: 'down' }, 502) })
    const { user } = await openSheet()
    await user.type(screen.getByLabelText('Place'), 'Fillmore{Enter}')
    expect(
      await screen.findByText(
        /did not answer\. Nothing was saved, and “Fillmore”/,
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Place')).toHaveValue('Fillmore')
  })

  it('has no axe violations, empty or with a new place', async () => {
    stubApi()
    const { user, view } = await openSheet()
    expect(await axeViolations(view.container.ownerDocument.body)).toEqual([])
    await user.type(screen.getByLabelText('Place'), 'Fillmore{Enter}')
    await user.click(
      await screen.findByRole('button', { name: /Fillmore Auditorium/ }),
    )
    expect(await axeViolations(view.container.ownerDocument.body)).toEqual([])
  })
})
