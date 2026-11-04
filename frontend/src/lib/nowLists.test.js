import { describe, expect, it } from 'vitest'
import { nowLists } from './nowLists.js'

const item = (id, fields) => ({
  id,
  type: 'game',
  status: 'backlog',
  wanted: false,
  finished_at: null,
  ...fields,
})

describe('nowLists', () => {
  it('splits playing from the most recent finishes, skipping wants', () => {
    const { playing, finished } = nowLists([
      item('1', { status: 'active' }),
      item('2', { status: 'active', wanted: true }),
      item('8', { status: 'active', type: 'movie' }),
      item('3', { status: 'finished', finished_at: '2026-01-02' }),
      item('4', { status: 'finished', finished_at: '2026-09-30' }),
      item('5', { status: 'finished', finished_at: '2026-05-01' }),
      item('6', { status: 'finished', finished_at: '2026-03-01' }),
      item('7', { status: 'finished', finished_at: '2025-12-01' }),
    ])
    expect(playing.map((row) => row.id)).toEqual(['1'])
    expect(finished.map((row) => row.id)).toEqual(['4', '5', '6', '3'])
  })

  it('lists paused games apart from playing, newest pause first', () => {
    const { playing, paused } = nowLists([
      item('1', { status: 'paused', paused_on: '2026-08-01' }),
      item('2', { status: 'paused', paused_on: '2026-10-01' }),
      item('3', { status: 'active' }),
    ])
    expect(playing.map((row) => row.id)).toEqual(['3'])
    expect(paused.map((row) => row.id)).toEqual(['2', '1'])
  })

  it('marks a replayed finish again, with its number', () => {
    const { finished } = nowLists([
      item('1', {
        status: 'finished',
        finished_at: '2026-10-19',
        times_completed: 2,
      }),
      item('2', {
        status: 'finished',
        finished_at: '2026-10-01',
        times_completed: 1,
      }),
    ])
    expect(
      finished.map((row) => [row.id, row.again, row.finish_number]),
    ).toEqual([
      ['1', true, 2],
      ['2', false, 1],
    ])
  })
})
