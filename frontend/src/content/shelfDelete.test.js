import { describe, expect, it } from 'vitest'
import { discardAsk, redoIntro } from './shelfDelete.js'

describe('discardAsk', () => {
  it('says goes for one thing and go for more', () => {
    expect(discardAsk('Box', { photos: 1, entries: {} })).toBe(
      'Discard Box? Its 1 photo goes with it.',
    )
    expect(discardAsk('Box', { photos: 0, entries: { check: 1 } })).toBe(
      'Discard Box? Its 1 entry goes with it.',
    )
    expect(discardAsk('Box', { photos: 1, entries: { check: 1 } })).toBe(
      'Discard Box? Its 1 photo and 1 entry go with it.',
    )
    expect(discardAsk('Box', { photos: 6, entries: { a: 40, b: 3 } })).toBe(
      'Discard Box? Its 6 photos and 43 entries go with it.',
    )
  })

  it('says an empty sitting has nothing in it', () => {
    expect(discardAsk('Box', { photos: 0, entries: {} })).toBe(
      'Discard Box? It has no photos or entries.',
    )
  })
})

describe('redoIntro', () => {
  it('says what does not come back', () => {
    expect(redoIntro('Hades')).toContain('rating, status and notes')
  })
})
