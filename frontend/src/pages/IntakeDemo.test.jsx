import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import IntakeDemo from './IntakeDemo.jsx'

// The page reads its recording through this module; the committed file is a
// placeholder until Joey records a shelf, so tests bring their own.
const state = vi.hoisted(() => ({ recording: null, reduced: true }))
vi.mock('../content/intakeDemo.js', () => ({
  get recording() {
    return state.recording
  },
}))
vi.mock('../lib/useMediaQuery.js', () => ({
  useMediaQuery: () => state.reduced,
}))

const RECORDING = {
  provisional: false,
  recorded_on: '2026-11-10',
  sources: ['tmdb'],
  stages: { read_ms: 800, match_ms: 400 },
  titles: [
    {
      read: 'ARRIVAL',
      year: 2016,
      kind: 'movie',
      confidence: 'exact',
      match: { title: 'Arrival', year: 2016 },
      candidates: [{ title: 'Arrival', year: 2016 }],
    },
    {
      read: 'THE THING',
      year: null,
      kind: 'movie',
      confidence: 'check',
      match: { title: 'The Thing', year: 1982 },
      candidates: [
        { title: 'The Thing', year: 1982 },
        { title: 'The Thing', year: 2011 },
      ],
    },
    {
      read: 'ALEIN',
      year: null,
      kind: 'movie',
      confidence: 'probable',
      match: { title: 'Alien', year: 1979 },
      candidates: [{ title: 'Alien', year: 1979 }],
    },
  ],
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/shelf/intake']}>
      <IntakeDemo />
    </MemoryRouter>,
  )
}

let fetchSpy
beforeEach(() => {
  state.recording = RECORDING
  state.reduced = true
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})

afterEach(() => {
  // AC 2: the demo makes no request at all, so none to /api.
  expect(fetchSpy).not.toHaveBeenCalled()
  fetchSpy.mockRestore()
  vi.useRealTimers()
})

describe('IntakeDemo', () => {
  it('opens on the drawn shelf and an empty review, with no request', async () => {
    const { container } = renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Try the intake' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/No model is called/)).toBeInTheDocument()
    expect(
      screen.getByRole('img', {
        name: 'A shelf of 3 spines: ARRIVAL, THE THING, ALEIN',
      }),
    ).toBeInTheDocument()
    const stages = screen.getByRole('list', { name: 'Stages' })
    expect(within(stages).getAllByRole('listitem')).toHaveLength(4)
    expect(stages).toHaveTextContent('titles looked up in TMDB')
    expect(screen.getByText(/Nothing read yet/)).toBeInTheDocument()
    expect(
      screen.getByText(/Confidence is computed from string distance/),
    ).toBeInTheDocument()
    expect(await axeViolations(container)).toEqual([])
  })

  it('replays the recording into Check rows with their confidence', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await user.click(screen.getByRole('button', { name: 'Read this shelf' }))

    const rows = screen.getAllByRole('listitem', { name: /read “/ })
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Arrival')
    expect(rows[0]).toHaveTextContent('read “ARRIVAL” · 2016')
    expect(within(rows[0]).getByText('Exact')).toBeInTheDocument()
    expect(rows[1]).toHaveTextContent('read “THE THING” · 1982 or 2011?')
    expect(within(rows[1]).getByText('Check')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Probable')).toBeInTheDocument()
    expect(
      screen.getByText('3 read · 1 exact · 1 probable · 1 to check'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Recorded 2026-11-10: read in 0.8 s, matched in 0.4 s.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Review').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(await axeViolations(container)).toEqual([])
  })

  it('says the add is pretend, and writes nothing', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Read this shelf' }))
    await user.click(screen.getByRole('button', { name: 'Add 2 (pretend)' }))
    expect(screen.getByRole('status')).toHaveTextContent(
      'Pretend: nothing was written.',
    )
    expect(screen.getByText('Add').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    )
    await user.click(screen.getByRole('button', { name: 'Start over' }))
    expect(screen.getByText(/Nothing read yet/)).toBeInTheDocument()
  })

  it('explains Search instead rather than calling a source', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Search instead' }))
    expect(screen.getByRole('status')).toHaveTextContent(
      /isn’t part of this recording/,
    )
  })

  it('lights Read, then Match, for the recorded times', async () => {
    state.reduced = false
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Read this shelf' }))
    expect(screen.getByText('Read').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.getByRole('status')).toHaveTextContent('Reading the spines…')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(screen.getByText('Match').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    )
    await act(() => vi.advanceTimersByTimeAsync(400))
    expect(screen.getAllByRole('listitem', { name: /read “/ })).toHaveLength(3)
  })

  it('moves focus to Start over after Read, and back to Read after Start over', () => {
    // fireEvent focuses nothing itself, so the page must move focus.
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Read this shelf' }))
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Start over' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }))
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Read this shelf' }),
    )
  })

  it('keeps focus on Start over through the replay and announces each stage', async () => {
    state.reduced = false
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Read this shelf' }))
    const over = screen.getByRole('button', { name: 'Start over' })
    expect(document.activeElement).toBe(over)
    expect(screen.getByRole('status')).toHaveTextContent('Reading the spines…')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(screen.getByRole('status')).toHaveTextContent('Matching the titles…')
    await act(() => vi.advanceTimersByTimeAsync(400))
    expect(screen.getByRole('status')).not.toHaveTextContent(/Matching|Reading/)
    expect(document.activeElement).toBe(over)
  })

  it('shows no demo while the recording is the provisional placeholder', () => {
    state.recording = null
    renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Try the intake' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/The recording isn’t in yet/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })
})
