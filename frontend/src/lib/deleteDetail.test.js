import { describe, expect, it } from 'vitest'
import {
  bulkDeleteDetail,
  deleteDetail,
  goesWith,
  previewLine,
} from './deleteDetail.js'

const NONE = {
  items: 1,
  playthroughs: 0,
  play_sessions: 0,
  comic_issues: 0,
  pick_events: 9,
  titles: ['Hades'],
}

describe('goesWith', () => {
  it('names playthroughs, journal days and issue records, never pick events', () => {
    expect(
      goesWith({
        ...NONE,
        playthroughs: 2,
        play_sessions: 11,
        comic_issues: 4,
      }),
    ).toEqual(['2 playthroughs', '11 journal days', '4 issue records'])
  })

  it('uses the singular for one', () => {
    expect(
      goesWith({ ...NONE, playthroughs: 1, play_sessions: 1, comic_issues: 1 }),
    ).toEqual(['1 playthrough', '1 journal day', '1 issue record'])
  })

  it('is empty when nothing is attached', () => {
    expect(goesWith(NONE)).toEqual([])
  })
})

describe('deleteDetail', () => {
  it('says what goes with a row', () => {
    expect(
      deleteDetail(
        { ...NONE, playthroughs: 2, play_sessions: 11 },
        'Hollow Knight',
      ),
    ).toBe('“Hollow Knight” goes with 2 playthroughs and 11 journal days.')
    expect(deleteDetail({ ...NONE, comic_issues: 4 }, 'Waterworld')).toBe(
      '“Waterworld” goes with 4 issue records.',
    )
  })

  it('says so when nothing is attached', () => {
    expect(deleteDetail(NONE, 'Hades')).toBe('Nothing else goes with “Hades”.')
  })
})

describe('bulkDeleteDetail', () => {
  it('names three titles and counts the rest', () => {
    expect(
      bulkDeleteDetail({
        ...NONE,
        items: 7,
        playthroughs: 3,
        titles: ['A', 'B', 'C'],
      }),
    ).toBe('“A”, “B”, “C” and 4 more go with 3 playthroughs.')
  })

  it('names every title when there are three or fewer', () => {
    expect(
      bulkDeleteDetail({
        ...NONE,
        items: 2,
        titles: ['A', 'B'],
        comic_issues: 1,
      }),
    ).toBe('“A” and “B” go with 1 issue record.')
  })

  it('reads as a single delete when one row is selected', () => {
    expect(bulkDeleteDetail({ ...NONE, playthroughs: 1 })).toBe(
      '“Hades” goes with 1 playthrough.',
    )
  })

  it('says so when nothing is attached', () => {
    expect(bulkDeleteDetail({ ...NONE, items: 2, titles: ['A', 'B'] })).toBe(
      '“A” and “B” go. Nothing else is attached.',
    )
  })
})

describe('previewLine', () => {
  const describe_ = () => 'words'

  it('holds the confirm off while loading and after a failure', () => {
    expect(
      previewLine({ status: 'loading', preview: null }, describe_),
    ).toEqual({ detail: 'Checking what goes with it.', ready: false })
    expect(
      previewLine({ status: 'error', preview: null }, describe_).ready,
    ).toBe(false)
  })

  it('lets it go ahead once the counts are in', () => {
    expect(previewLine({ status: 'ready', preview: NONE }, describe_)).toEqual({
      detail: 'words',
      ready: true,
    })
  })
})
