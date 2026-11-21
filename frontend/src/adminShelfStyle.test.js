// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  SHELF_ACTIONS_HOVER,
  SHELF_ACTIONS_SHEET,
} from './components/shelf-classes.js'

// The admin card's panel is utilities on CardActionsShell (#536, slice D4);
// these pin what the old rules in index.css guarded.
describe('the admin card panel on a pointer device (#532 b)', () => {
  // In flow at opacity 0 it left 250px of empty card: it is taken out of the
  // flow, kept reachable by opacity (never display or visibility), and drawn
  // on a solid surface so the text under it does not show through.
  const panel = SHELF_ACTIONS_HOVER.split(' ')

  it('is out of the flow, anchored to the card foot', () => {
    expect(panel).toContain('absolute')
    expect(panel).toContain('bottom-0')
  })

  it('has a solid surface and is never hidden with display or visibility', () => {
    expect(panel).toContain('bg-(--surface)')
    expect(panel).not.toContain('hidden')
    expect(panel).not.toContain('invisible')
    expect(panel).not.toContain('collapse')
    expect(panel.some((name) => /^(?:max-)?[a-z]+:hidden$/.test(name))).toBe(
      false,
    )
  })

  it('is revealed on hover and on focus within, without moving anything', () => {
    expect(panel).toContain('opacity-0')
    expect(panel).toContain('[.poster-card:hover_&]:opacity-100')
    expect(panel).toContain('focus-within:opacity-100')
  })

  it('keeps the touch form in the flow, above the card link', () => {
    expect(SHELF_ACTIONS_SHEET.split(' ')).toEqual(
      expect.arrayContaining(['relative', 'z-10']),
    )
  })
})
