import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

// The Closet pages draw from the Button, Card and Input looks (#535). The
// legacy `.btn`, `.chip` and `.panel` classes stay for areas not yet migrated
// (#536), so each migrated file is pinned not to use them.
const FILES = [
  'pages/AdminCloset.jsx',
  'pages/AdminClosetToday.jsx',
  'pages/AdminClosetReview.jsx',
  'pages/AdminClosetProfile.jsx',
  'pages/AdminGarment.jsx',
  'components/GarmentForm.jsx',
  'components/GarmentProductPanel.jsx',
  'components/GarmentTable.jsx',
  'components/OutfitBoard.jsx',
  'components/ReviewDeck.jsx',
  'components/SellChecklistSheet.jsx',
  'components/SeasonTurnBanner.jsx',
]
const LEGACY = /className="[^"]*\b(btn|chip|panel|outfit-piece-btn)\b[^"]*"/

describe('Closet pages and the legacy look', () => {
  for (const file of FILES) {
    it(`${file} has no legacy btn, chip or panel class`, () => {
      const text = readFileSync(resolve(cwd(), 'src', file), 'utf8')
      expect(text.match(LEGACY)?.[0]).toBeUndefined()
    })
  }

  it('the Today grid column may shrink', () => {
    const css = readFileSync(resolve(cwd(), 'src/index.css'), 'utf8')
    expect(css).toMatch(
      /\.today \{[^}]*grid-template-columns: minmax\(0, 1fr\)/,
    )
  })
})
