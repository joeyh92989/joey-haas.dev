import { describe, expect, it } from 'vitest'
import { staleProblems } from './doctor.mjs'

describe('doctor', () => {
  it('keeps missing and invalid dependencies', () => {
    expect(
      staleProblems([
        'missing: class-variance-authority@^0.7.1, required by x@0.1.0',
        'invalid: react@18.0.0 /path/react',
      ]),
    ).toHaveLength(2)
  })

  it('ignores extraneous packages and an empty list', () => {
    expect(staleProblems(['extraneous: tslib@2.9.1 /path/tslib'])).toEqual([])
    expect(staleProblems()).toEqual([])
  })
})
