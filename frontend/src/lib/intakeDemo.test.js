import { describe, expect, it } from 'vitest'
import {
  STAGE_CAP_MS,
  demoCounts,
  readRecording,
  rowMeta,
  rowTitle,
  stageDelays,
} from './intakeDemo.js'

const ROWS = [
  {
    read: 'ARRIVAL',
    year: 2016,
    kind: 'movie',
    confidence: 'exact',
    match: { title: 'Arrival', year: 2016 },
    candidates: [{ title: 'Arrival', year: 2016 }],
  },
  {
    read: 'THE THING',
    year: null,
    kind: 'movie',
    confidence: 'check',
    match: { title: 'The Thing', year: 1982 },
    candidates: [
      { title: 'The Thing', year: 1982 },
      { title: 'The Thing', year: 2011 },
    ],
  },
  {
    read: 'ALEIN',
    year: null,
    kind: 'movie',
    confidence: 'probable',
    match: { title: 'Alien', year: 1979 },
    candidates: [{ title: 'Alien', year: 1979 }],
  },
  {
    read: 'SMUDGE',
    year: null,
    kind: 'movie',
    confidence: 'check',
    match: null,
    candidates: [],
  },
]

const RECORDING = {
  provisional: false,
  recorded_on: '2026-11-10',
  sources: ['tmdb'],
  stages: { read_ms: 8200, match_ms: 640 },
  titles: ROWS,
}

describe('readRecording', () => {
  it('passes a recorder file through', () => {
    expect(readRecording(RECORDING)).toEqual(RECORDING)
  })

  it('refuses the provisional placeholder', () => {
    expect(readRecording({ provisional: true })).toBeNull()
  })

  it('refuses a file with no titles or no stages', () => {
    expect(readRecording({ ...RECORDING, titles: [] })).toBeNull()
    expect(readRecording({ ...RECORDING, stages: undefined })).toBeNull()
    expect(readRecording(null)).toBeNull()
  })
})

describe('demoCounts', () => {
  it('counts what was read, and what a commit would add', () => {
    expect(demoCounts(ROWS)).toEqual({
      read: 4,
      exact: 1,
      probable: 1,
      check: 2,
      adds: 1,
    })
  })
})

describe('rows', () => {
  it('titles a row by its match, or by what was read', () => {
    expect(rowTitle(ROWS[2])).toBe('Alien')
    expect(rowTitle(ROWS[3])).toBe('SMUDGE')
  })

  it('says what was read and the year, or the years in doubt', () => {
    expect(rowMeta(ROWS[0])).toBe('read “ARRIVAL” · 2016')
    expect(rowMeta(ROWS[1])).toBe('read “THE THING” · 1982 or 2011?')
    expect(rowMeta(ROWS[2])).toBe('read “ALEIN” · 1979')
    expect(rowMeta(ROWS[3])).toBe('read “SMUDGE” · no match found')
  })
})

describe('stageDelays', () => {
  it('replays each stage for its recorded time, capped', () => {
    expect(stageDelays(RECORDING.stages)).toEqual({
      read: STAGE_CAP_MS,
      match: 640,
    })
  })

  it('replays at once when motion is reduced', () => {
    expect(stageDelays(RECORDING.stages, { reduced: true })).toEqual({
      read: 0,
      match: 0,
    })
  })
})
