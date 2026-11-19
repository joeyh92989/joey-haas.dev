import '@testing-library/jest-dom'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DidYouGo from './DidYouGo.jsx'
import { READ_DEADLINE_MS } from '../lib/waits.js'

const BALL = {
  week: '2026-W46',
  slot: 'best',
  spot_id: 'ball',
  spot_name: 'Ball Arena',
  neighbourhood: 'Auraria',
  day: '2026-11-14',
  slot_label: 'Best fit',
}
const GARDENS = {
  week: '2026-W46',
  slot: 'new',
  spot_id: 'gardens',
  spot_name: 'Denver Botanic Gardens',
  neighbourhood: null,
  day: '2026-11-15',
  slot_label: 'Try somewhere new',
}

function json(body, status = 200) {
  return { ok: status < 300, status, json: async () => body }
}

/** Records every write; `answer(path)` decides the response. */
function stub(answer = () => json({ ok: true })) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      const path = String(url).replace(/^.*\/api/, '/api')
      calls.push({ path, body: JSON.parse(options.body) })
      return answer(path)
    }),
  )
  return calls
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function setup(asks = [BALL, GARDENS], onChanged = vi.fn()) {
  const view = render(<DidYouGo asks={asks} onChanged={onChanged} />)
  return { onChanged, ...view }
}

describe('DidYouGo', () => {
  it('renders nothing when there are no asks', () => {
    const { container } = setup([])
    expect(container).toBeEmptyDOMElement()
  })

  it('shows one due slot as a row with its details', () => {
    setup([BALL])
    expect(screen.getByRole('heading', { name: /Did you go\?/ })).toBeVisible()
    expect(screen.getByText('1 to answer')).toBeVisible()
    const row = screen.getByRole('listitem')
    expect(within(row).getByText('Best fit')).toBeVisible()
    expect(within(row).getByText('Saturday, Nov 14')).toBeVisible()
    expect(within(row).getByText('Auraria')).toBeVisible()
    expect(
      within(row).getByRole('button', { name: 'Been: Ball Arena' }),
    ).toBeVisible()
    expect(
      within(row).getByRole('button', { name: 'Didn’t go: Ball Arena' }),
    ).toBeVisible()
  })

  it('lists several due slots and leaves a missing neighbourhood out', () => {
    setup()
    expect(screen.getByText('2 to answer')).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByText('null')).not.toBeInTheDocument()
  })

  it('opens the verdict row inside the row, with a shape and a word each', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Been: Ball Arena' }))
    const group = screen.getByRole('group', { name: 'Verdict for Ball Arena' })
    const words = within(group)
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(words).toEqual(['Loved', 'Fine', 'Not again'])
    expect(
      group.querySelectorAll('.vmark-loved, .vmark-fine, .vmark-not_again'),
    ).toHaveLength(3)
    expect(
      screen.getByRole('button', { name: 'Been: Ball Arena' }),
    ).toHaveAttribute('aria-expanded', 'true')
    // Only that row opened.
    expect(screen.getAllByRole('group', { name: /Verdict for/ })).toHaveLength(
      1,
    )
    await user.click(screen.getByRole('button', { name: 'Been: Ball Arena' }))
    expect(
      screen.queryByRole('group', { name: /Verdict for/ }),
    ).not.toBeInTheDocument()
  })

  it('logs a Been with the verdict, the slot’s day and day precision, then says so and drops the row', async () => {
    const user = userEvent.setup()
    const calls = stub()
    const { onChanged } = setup()
    await user.click(screen.getByRole('button', { name: 'Been: Ball Arena' }))
    await user.click(screen.getByRole('button', { name: 'Loved' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Logged: Loved at Ball Arena',
      ),
    )
    expect(calls).toEqual([
      {
        path: '/api/spots/outings',
        body: {
          spot_id: 'ball',
          visited_on: '2026-11-14',
          precision: 'day',
          verdict: 'loved',
        },
      },
    ])
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Ball Arena', { selector: 'h3' })).toBeNull()
    expect(screen.getByText('1 to answer')).toBeVisible()
  })

  it('sends the note and who came when they were filled in, and never needs them', async () => {
    const user = userEvent.setup()
    const calls = stub()
    setup([BALL])
    await user.click(screen.getByRole('button', { name: 'Been: Ball Arena' }))
    await user.click(
      screen.getByRole('button', { name: 'Add a note or who came' }),
    )
    const note = screen.getByLabelText('Note (optional, one line)')
    expect(note).toHaveAttribute('maxLength', '140')
    await user.type(note, '  Great seats ')
    await user.click(screen.getByRole('button', { name: 'Came along' }))
    expect(screen.getByRole('button', { name: 'Came along' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Not again' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].body).toEqual({
      spot_id: 'ball',
      visited_on: '2026-11-14',
      precision: 'day',
      verdict: 'not_again',
      note: 'Great seats',
      kid_along: true,
    })
  })

  it('records Didn’t on the plan route and says it was marked', async () => {
    const user = userEvent.setup()
    const calls = stub()
    const { onChanged } = setup()
    await user.click(
      screen.getByRole('button', { name: 'Didn’t go: Denver Botanic Gardens' }),
    )
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Marked as not gone: Denver Botanic Gardens',
      ),
    )
    expect(calls).toEqual([
      {
        path: '/api/spots/plan/didnt',
        body: { week: '2026-W46', slot: 'new' },
      },
    ])
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('removes the block after the last answer and keeps the status line', async () => {
    const user = userEvent.setup()
    stub()
    setup([BALL])
    await user.click(
      screen.getByRole('button', { name: 'Didn’t go: Ball Arena' }),
    )
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Marked as not gone',
      ),
    )
    expect(screen.queryByRole('heading', { name: /Did you go/ })).toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('keeps the row and says nothing was written when a write fails', async () => {
    const user = userEvent.setup()
    stub(() => json({ detail: 'boom' }, 500))
    const { onChanged } = setup([BALL])
    await user.click(screen.getByRole('button', { name: 'Been: Ball Arena' }))
    await user.click(screen.getByRole('button', { name: 'Fine' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Not saved')
    expect(alert).toHaveTextContent(
      'That didn’t go through. Check your connection. Nothing was written.',
    )
    expect(screen.getByText('Ball Arena', { selector: 'h3' })).toBeVisible()
    expect(screen.getByRole('group', { name: /Verdict for/ })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Fine' })).toBeEnabled()
    expect(onChanged).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('keeps the row when Didn’t fails, and a retry can succeed', async () => {
    const user = userEvent.setup()
    let fail = true
    stub(() => (fail ? json({}, 500) : json({ asks: [] })))
    setup([BALL])
    const button = () =>
      screen.getByRole('button', { name: 'Didn’t go: Ball Arena' })
    await user.click(button())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nothing was written',
    )
    fail = false
    await user.click(button())
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Marked as not gone',
      ),
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says a write may or may not have been saved when nobody answers', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    const { onChanged } = setup([BALL])
    fireClick(screen.getByRole('button', { name: 'Been: Ball Arena' }))
    fireClick(screen.getByRole('button', { name: 'Loved' }))
    await act(() => vi.advanceTimersByTimeAsync(READ_DEADLINE_MS + 1))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'may or may not have been saved',
    )
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Ball Arena', { selector: 'h3' })).toBeVisible()
  })

  it('sends one write for a double tap', async () => {
    const user = userEvent.setup()
    let release
    const calls = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        calls.push(url)
        await new Promise((resolve) => {
          release = resolve
        })
        return json({ ok: true })
      }),
    )
    setup([BALL])
    await user.click(screen.getByRole('button', { name: 'Been: Ball Arena' }))
    const loved = screen.getByRole('button', { name: 'Loved' })
    await user.click(loved)
    expect(screen.getByRole('button', { name: 'Loved' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Fine' }))
    expect(calls).toHaveLength(1)
    release()
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Logged'),
    )
  })

  it('hides the block for Not now and says it asks again next visit', async () => {
    const user = userEvent.setup()
    const calls = stub()
    setup()
    await user.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('heading', { name: /Did you go/ })).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Hidden for now. It asks again on your next visit.',
    )
    expect(calls).toEqual([])
  })

  it('asks again on a new visit after Not now', async () => {
    const user = userEvent.setup()
    const first = setup()
    await user.click(screen.getByRole('button', { name: 'Not now' }))
    first.unmount()
    setup()
    expect(screen.getByRole('heading', { name: /Did you go/ })).toBeVisible()
  })

  it('does not open a row’s verdict when Didn’t is pressed', async () => {
    const user = userEvent.setup()
    stub()
    setup()
    await user.click(
      screen.getByRole('button', { name: 'Didn’t go: Ball Arena' }),
    )
    expect(screen.queryByRole('group', { name: /Verdict for/ })).toBeNull()
  })
})

function fireClick(element) {
  act(() => element.click())
}
