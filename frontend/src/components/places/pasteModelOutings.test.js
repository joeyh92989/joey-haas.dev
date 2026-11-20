import { describe, expect, it } from 'vitest'
import {
  OUTING_GROUPS,
  groupOf,
  kindOf,
  outingGroupOf,
  outingKindOf,
} from './pasteModel.js'

const outing = (extra = {}) => ({
  date_text: '2023',
  visited_on: '2023-01-01',
  precision: 'year',
  skip: false,
  ...extra,
})
const entry = (state, payload = {}, extra = {}) => ({
  id: '0e000000-0000-4000-8000-000000000001',
  state,
  payload: { name: 'A place', ...payload },
  outing: outing(extra),
})

describe('outingKindOf and outingGroupOf', () => {
  it('puts every state an entry can have in a group the list draws', () => {
    const none = new Set()
    const states = ['ready', 'owned', 'ignored', 'reading', 'check', 'other']
    for (const state of states) {
      for (const extra of [
        {},
        { skip: true },
        { skip: true, duplicate_of: 'v1' },
        { skip: true, repeat_of: 'e2' },
        { visited_on: null, precision: null },
      ]) {
        const kind = outingKindOf(entry(state, {}, extra), none, none)
        expect(OUTING_GROUPS).toContain(outingGroupOf(kind))
      }
    }
  })

  it('an ignored entry is left out, and an unknown kind goes to Left out', () => {
    const none = new Set()
    expect(outingKindOf(entry('ignored'), none, none)).toBe('out')
    // The place paste's own kinds name groups an outings list lacks.
    expect(groupOf('same')).toBe('same')
    expect(outingGroupOf('same')).toBe('out')
    expect(outingGroupOf('saved')).toBe('out')
    expect(outingGroupOf('other')).toBe('out')
    expect(outingGroupOf('several')).toBe('check')
  })

  it('a repeat of an earlier line is Already logged', () => {
    const none = new Set()
    expect(
      outingKindOf(
        entry('ready', {}, { skip: true, repeat_of: 'e1' }),
        none,
        none,
      ),
    ).toBe('logged')
    expect(outingKindOf(entry('ready', {}, { skip: true }), none, none)).toBe(
      'out',
    )
  })

  it('a refused row is told after the date and before the place', () => {
    const refused = new Set(['0e000000-0000-4000-8000-000000000001'])
    expect(outingKindOf(entry('ready'), new Set(), refused)).toBe('refused')
    expect(
      outingKindOf(
        entry('ready', {}, { visited_on: null }),
        new Set(),
        refused,
      ),
    ).toBe('date')
    // The place paste's reading of the same entry is untouched.
    expect(kindOf(entry('owned'), new Set(), new Set())).toBe('saved')
  })
})
