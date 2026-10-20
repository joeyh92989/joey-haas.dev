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
})
