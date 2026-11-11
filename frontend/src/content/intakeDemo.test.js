import { describe, expect, it } from 'vitest'
import raw from './intake-demo.json'
import { recording } from './intakeDemo.js'

// Merge gate (intake plan, PR 4): the changelog already says "Try the intake
// demo on a recorded shelf" and the page is in the sitemap and site search
// (STATIC_PAGES), so the committed file must be a real recording before
// this branch merges. Red on purpose while the placeholder is committed;
// the PR waits in draft until the recording lands.
describe('intake-demo.json', () => {
  it('is a real recording, not the provisional placeholder', () => {
    expect(
      raw.provisional,
      'Record the demo before merging (scripts/record_intake_demo.py)',
    ).toBe(false)
    expect(
      recording,
      'Record the demo before merging (scripts/record_intake_demo.py)',
    ).not.toBeNull()
  })
})
