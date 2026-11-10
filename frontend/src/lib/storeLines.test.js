import { describe, expect, it } from 'vitest'
import { storeLabel } from './storeLines.js'

describe('storeLabel', () => {
  const standard = { store: 'Limited Run', listing_title: 'Game (Standard)' }
  const deluxe = { store: 'Limited Run', listing_title: "Game (Collector's)" }
  const other = { store: 'Play-Asia', listing_title: 'Game' }

  it('names the listing when a store repeats', () => {
    const lines = [standard, deluxe, other]
    expect(storeLabel(standard, lines)).toBe('Limited Run — Game (Standard)')
    expect(storeLabel(deluxe, lines)).toBe("Limited Run — Game (Collector's)")
  })

  it('keeps the bare store name when the store is listed once', () => {
    expect(storeLabel(other, [standard, deluxe, other])).toBe('Play-Asia')
  })

  it('keeps the bare store name for a row stored before the field', () => {
    const old = { store: 'Limited Run' }
    expect(storeLabel(old, [old, { store: 'Limited Run' }])).toBe('Limited Run')
  })
})
