import { describe, expect, it } from 'vitest'
import { parseChangelog } from './changelog.js'

const FILE = `# Changes

Some prose about the file.

## 2026-10-23

- Older change.

## 2026-11-04

- [My Shelf](/shelf) shows what I am playing,
  continued on the next line.
- A second change with [two](/a) links, one [outside](https://x.test/p).
`

describe('parseChangelog', () => {
  it('reads dated entries newest first, joining continued lines', () => {
    const entries = parseChangelog(FILE)
    expect(entries.map((entry) => entry.date)).toEqual([
      '2026-11-04',
      '2026-10-23',
    ])
    expect(entries[0].lines).toEqual([
      '[My Shelf](/shelf) shows what I am playing, continued on the next line.',
      'A second change with [two](/a) links, one [outside](https://x.test/p).',
    ])
    expect(entries[1].lines).toEqual(['Older change.'])
  })

  it('reads a file with Windows line endings the same way', () => {
    const entries = parseChangelog(FILE.replaceAll('\n', '\r\n'))
    expect(entries[1].lines).toEqual(['Older change.'])
    expect(entries[0].lines[0]).toMatch(/line\.$/)
  })

  it('throws on a heading that is not a real date', () => {
    for (const heading of [
      '## November',
      '## 2026-11-4',
      '##2026-11-04',
      '## 2026-13-01',
      '## 2026-11-31',
      '### 2026-11-04',
    ]) {
      expect(() => parseChangelog(`${heading}\n\n- x\n`), heading).toThrow(
        'not a date heading',
      )
    }
  })

  it('throws on a date with no changes, last or not', () => {
    expect(() => parseChangelog('## 2026-11-04\n')).toThrow('no changes')
    expect(() =>
      parseChangelog('## 2026-11-04\n\n## 2026-11-03\n\n- x\n'),
    ).toThrow('no changes under 2026-11-04')
  })

  it('throws on a date used twice', () => {
    expect(() =>
      parseChangelog('## 2026-11-04\n\n- x\n\n## 2026-11-04\n\n- y\n'),
    ).toThrow('appears twice')
  })

  it('throws on text that is not a bullet, and on a nested bullet', () => {
    expect(() => parseChangelog('## 2026-11-04\n\nA paragraph.\n')).toThrow(
      'not a bullet',
    )
    expect(() =>
      parseChangelog('## 2026-11-04\n\n- parent\n  - child\n'),
    ).toThrow('nested bullet')
  })
})
