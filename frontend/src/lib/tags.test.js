import { describe, expect, it } from 'vitest'
import snapshot from '../../e2e/fixtures/snapshot/items.json'
import vocabulary from '../content/tagVocabulary.json'
import { tagGroupsOf, tagWords } from '../content/tags.js'
import {
  MAX_SHARE,
  filterByTags,
  hasTagFilter,
  itemTagGroups,
  noTags,
  tagChipGroups,
  tagsOf,
  toggleTag,
} from './tags.js'

const tag = (group, word) => ({ group, tag: word })
const row = (...tags) => ({ type: 'game', tags })

describe('the words', () => {
  it('has a word for every key the API can send, and no word without a key', () => {
    for (const [type, groups] of Object.entries(vocabulary)) {
      expect(Object.keys(tagWords[type])).toEqual(groups.map((g) => g.key))
      for (const { key, tags } of groups) {
        expect(Object.keys(tagWords[type][key].tags)).toEqual(tags)
        expect(tagWords[type][key].label).toBeTruthy()
      }
    }
  })

  it('reads the games groups as Play style, Setting and Tone', () => {
    expect(tagGroupsOf('game').map((g) => g.label)).toEqual([
      'Play style',
      'Setting',
      'Tone',
    ])
    expect(tagGroupsOf('comic').map((g) => g.label)).toEqual([
      'Genre',
      'Based on',
      'Form',
    ])
    expect(tagGroupsOf('movie')).toEqual([])
  })
})

describe('tagsOf', () => {
  it('tolerates a row from before tags existed', () => {
    expect(tagsOf({})).toEqual([])
    expect(tagsOf(null)).toEqual([])
    expect(tagsOf({ tags: 'x' })).toEqual([])
  })
})

describe('tagChipGroups', () => {
  const rows = [
    row(tag('play_style', 'shooter'), tag('setting', 'sci-fi')),
    row(tag('play_style', 'shooter')),
    row(tag('play_style', 'rpg'), tag('setting', 'sci-fi')),
    row(tag('play_style', 'puzzle')),
  ]

  it('counts each tag over the rows, the commonest first', () => {
    const [style] = tagChipGroups('game', rows)
    expect(style.label).toBe('Play style')
    expect(style.options.slice(0, 3)).toEqual([
      { value: 'shooter', label: 'Shooter', count: 2 },
      { value: 'rpg', label: 'RPG', count: 1 },
      { value: 'puzzle', label: 'Puzzle', count: 1 },
    ])
  })

  it('leaves out a chip that matches more than the share it is given', () => {
    const [style, setting] = tagChipGroups('game', rows, { maxShare: 0.5 })
    // Shooter and sci-fi each match exactly half: kept. Nothing is over.
    expect(style.options.map((o) => o.value)).toContain('shooter')
    expect(setting.options.map((o) => o.value)).toContain('sci-fi')
    const broad = [...rows, row(tag('play_style', 'shooter'))]
    const [after] = tagChipGroups('game', broad, { maxShare: 0.5 })
    // Three of five is over half.
    expect(after.options.map((o) => o.value)).not.toContain('shooter')
  })

  it('never drops the pressed chip, even over the share', () => {
    const broad = [
      ...rows,
      row(tag('play_style', 'shooter')),
      row(tag('play_style', 'shooter')),
    ]
    const dropped = tagChipGroups('game', broad, { maxShare: 0.5 })[0]
    expect(dropped.options.map((o) => o.value)).not.toContain('shooter')
    const kept = tagChipGroups('game', broad, {
      maxShare: 0.5,
      selected: { play_style: 'shooter' },
    })[0]
    expect(kept.options.map((o) => o.value)).toContain('shooter')
  })

  it('carries a group’s limit and its More label', () => {
    const [style] = tagChipGroups('game', rows, {
      limit: { play_style: 8 },
      moreLabel: { play_style: 'More play styles…' },
    })
    expect(style.limit).toBe(8)
    expect(style.moreLabel).toBe('More play styles…')
  })
})

describe('the shelf fixture', () => {
  // The Done-when for the Games page: no filter chip matches more than half
  // the shelf it is given. The fixture shelf is invented, so this holds the
  // vocabulary and the page's rule together, not the real collection.
  const games = snapshot.filter((item) => item.type === 'game')

  it('gives the games fixture tags to filter by', () => {
    expect(games.some((game) => tagsOf(game).length > 0)).toBe(true)
  })

  it('draws no chip that matches more than half of the games', () => {
    const groups = tagChipGroups('game', games, { maxShare: MAX_SHARE })
    for (const group of groups) {
      for (const option of group.options) {
        expect(option.count).toBeLessThanOrEqual(games.length * MAX_SHARE)
      }
    }
    expect(groups.flatMap((g) => g.options).length).toBeGreaterThan(0)
  })

  it('has its own tags inside the vocabulary', () => {
    const allowed = new Set(
      vocabulary.game.flatMap((g) => g.tags.map((t) => `${g.key}/${t}`)),
    )
    for (const game of games) {
      for (const entry of tagsOf(game)) {
        expect(allowed.has(`${entry.group}/${entry.tag}`)).toBe(true)
      }
    }
  })
})

describe('filterByTags', () => {
  const rows = [
    row(tag('play_style', 'shooter'), tag('setting', 'sci-fi')),
    row(tag('play_style', 'shooter'), tag('setting', 'horror')),
    row(tag('setting', 'sci-fi')),
  ]

  it('is the identity with nothing chosen', () => {
    expect(filterByTags(rows, 'game', noTags('game'))).toBe(rows)
    expect(hasTagFilter('game', noTags('game'))).toBe(false)
  })

  it('takes a group’s chip, and ANDs groups', () => {
    expect(filterByTags(rows, 'game', { play_style: 'shooter' })).toHaveLength(
      2,
    )
    expect(
      filterByTags(rows, 'game', { play_style: 'shooter', setting: 'sci-fi' }),
    ).toEqual([rows[0]])
    expect(hasTagFilter('game', { setting: 'sci-fi' })).toBe(true)
  })

  it('ignores a key the type has no group for', () => {
    expect(filterByTags(rows, 'game', { genre: 'horror' })).toBe(rows)
  })
})

describe('itemTagGroups', () => {
  it('groups a row’s tags in vocabulary order and drops empty groups', () => {
    const groups = itemTagGroups({
      type: 'comic',
      tags: [
        tag('form', 'ongoing'),
        tag('genre', 'sci-fi'),
        tag('genre', 'horror'),
      ],
    })
    expect(groups.map((g) => [g.label, g.tags.map((t) => t.label)])).toEqual([
      ['Genre', ['Horror', 'Sci-fi']],
      ['Form', ['Ongoing']],
    ])
  })
})

describe('toggleTag', () => {
  it('adds in vocabulary order and removes', () => {
    const one = toggleTag('game', [], 'tone', 'comedy')
    const two = toggleTag('game', one, 'play_style', 'rpg')
    expect(two).toEqual([tag('play_style', 'rpg'), tag('tone', 'comedy')])
    expect(toggleTag('game', two, 'tone', 'comedy')).toEqual([
      tag('play_style', 'rpg'),
    ])
  })
})
