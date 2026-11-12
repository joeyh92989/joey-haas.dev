import { describe, expect, it } from 'vitest'
import { jobsSummary } from './adminJobs.js'

const ok = (label) => ({ label, state: 'ok' })
const scheduled = (label) => ({
  label,
  state: 'unknown',
  stateWords: 'scheduled',
})

describe('jobsSummary', () => {
  it('reads all ok', () => {
    expect(jobsSummary([ok('A'), ok('B')])).toEqual({
      state: 'ok',
      words: '2 of 2 jobs ok',
    })
  })

  it('does not call a scheduled job a problem', () => {
    expect(jobsSummary([ok('A'), ok('B'), scheduled('Spot finder')])).toEqual({
      state: 'ok',
      words: '2 of 3 jobs ok',
    })
  })

  it('still names a genuinely unknown job', () => {
    const out = jobsSummary([ok('A'), { label: 'Radar', state: 'unknown' }])
    expect(out.state).toBe('unknown')
    expect(out.words).toBe('1 of 2 jobs ok · Radar unknown')
  })

  it('names a failed job ahead of a scheduled one', () => {
    const out = jobsSummary([
      scheduled('Spot finder'),
      { label: 'Stores', state: 'failed', stateWords: 'failed' },
    ])
    expect(out.words).toBe('0 of 2 jobs ok · Stores failed')
  })
})
