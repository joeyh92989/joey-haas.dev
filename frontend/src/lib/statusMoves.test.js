import { afterEach, describe, expect, it, vi } from 'vitest'
import { localToday, setStatus, statusMoves } from './statusMoves.js'

const byStatus = (item) =>
  Object.fromEntries(statusMoves(item).map((entry) => [entry.status, entry]))

describe('statusMoves', () => {
  it('lists every status in the shelf order, marking the current one', () => {
    const entries = statusMoves({ status: 'backlog' })
    expect(entries.map((entry) => entry.status)).toEqual([
      'backlog',
      'active',
      'paused',
      'finished',
      'abandoned',
    ])
    expect(entries.filter((entry) => entry.current)).toHaveLength(1)
    expect(entries[1]).toMatchObject({ label: 'Playing', hint: null })
  })

  it('names Replay with the playthrough it starts', () => {
    const entry = byStatus({
      status: 'finished',
      playthroughs: [
        { number: 1, outcome: 'finished' },
        { number: 2, outcome: 'finished' },
      ],
    }).active
    expect(entry).toMatchObject({
      label: 'Replay',
      hint: 'starts playthrough 3',
      name: 'Replay, starts playthrough 3',
    })
  })

  it('falls back to the completion count without playthrough rows', () => {
    expect(
      byStatus({ status: 'finished', times_completed: 1 }).active.hint,
    ).toBe('starts playthrough 2')
  })

  it('names Try again from abandoned', () => {
    expect(byStatus({ status: 'abandoned' }).active.label).toBe('Try again')
  })

  it('names Resume with the pause month', () => {
    const entry = byStatus({
      status: 'paused',
      playthroughs: [{ number: 1, outcome: null, paused_on: '2026-08-12' }],
    }).active
    expect(entry.name).toBe('Resume, since Aug 2026')
  })

  it('names Finish and Pause from playing, and nothing else', () => {
    const entries = byStatus({ status: 'active' })
    expect(entries.finished.name).toBe('Finish, dated today')
    expect(entries.paused.name).toBe('Pause, keeps the date')
    expect(entries.abandoned.label).toBe('Abandoned')
    expect(entries.backlog.label).toBe('Backlog')
  })
})

describe('setStatus', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('posts the status and the local date to the status route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    await setStatus('abc', 'paused')
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/api\/items\/abc\/status$/)
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({
      status: 'paused',
      today: localToday(),
    })
  })
})

describe('localToday', () => {
  // The column is a date, and "today" is the owner's day, not UTC's: at 11pm
  // in Denver, UTC is already tomorrow.
  it('formats the local calendar date', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })
})
