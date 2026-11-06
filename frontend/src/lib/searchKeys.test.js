import { describe, expect, it } from 'vitest'
import { isSearchShortcut } from './searchKeys.js'

const key = (init) => ({
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...init,
})
const el = (tagName, extra = {}) => ({
  tagName,
  isContentEditable: false,
  ...extra,
})

describe('isSearchShortcut', () => {
  it('opens on ⌘K and Ctrl+K, in a text field too', () => {
    expect(isSearchShortcut(key({ key: 'k', metaKey: true }), el('BODY'))).toBe(
      true,
    )
    expect(
      isSearchShortcut(key({ key: 'k', ctrlKey: true }), el('INPUT')),
    ).toBe(true)
    expect(isSearchShortcut(key({ key: 'K', metaKey: true }), null)).toBe(true)
  })

  it('ignores K alone, or with Alt or Shift', () => {
    expect(isSearchShortcut(key({ key: 'k' }), el('BODY'))).toBe(false)
    expect(
      isSearchShortcut(
        key({ key: 'k', metaKey: true, altKey: true }),
        el('BODY'),
      ),
    ).toBe(false)
    expect(
      isSearchShortcut(
        key({ key: 'K', ctrlKey: true, shiftKey: true }),
        el('BODY'),
      ),
    ).toBe(false)
  })

  it('opens on / outside anything that types', () => {
    expect(isSearchShortcut(key({ key: '/' }), el('BODY'))).toBe(true)
    expect(isSearchShortcut(key({ key: '/' }), el('BUTTON'))).toBe(true)
    expect(isSearchShortcut(key({ key: '/' }), null)).toBe(true)
  })

  it('leaves / to inputs, textareas, selects and contenteditable', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(isSearchShortcut(key({ key: '/' }), el(tag))).toBe(false)
    }
    expect(
      isSearchShortcut(
        key({ key: '/' }),
        el('DIV', { isContentEditable: true }),
      ),
    ).toBe(false)
  })

  it('ignores / with a modifier', () => {
    for (const mod of ['metaKey', 'ctrlKey', 'altKey']) {
      expect(isSearchShortcut(key({ key: '/', [mod]: true }), el('BODY'))).toBe(
        false,
      )
    }
  })

  it('ignores composing and repeated keys and other keys', () => {
    expect(
      isSearchShortcut(
        key({ key: 'k', metaKey: true, isComposing: true }),
        el('BODY'),
      ),
    ).toBe(false)
    expect(isSearchShortcut(key({ key: '/', repeat: true }), el('BODY'))).toBe(
      false,
    )
    expect(isSearchShortcut(key({ key: 'Escape' }), el('BODY'))).toBe(false)
  })
})
