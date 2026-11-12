import { beforeAll, describe, expect, it } from 'vitest'
import { compileEntry } from './vite-plugin-markdown.js'

describe('compileEntry heading ids', () => {
  // The first highlight loads Shiki's grammars, which is slow on a cold run.
  beforeAll(() => compileEntry('```js\n1\n```'), 60_000)

  it('gives every h2 and h3 a slug id and lists the h2s', async () => {
    const { html, headings } = await compileEntry(
      '## First part\n\ntext\n\n### A sub-part\n\n## Second, with *style*!\n',
    )
    expect(html).toContain('<h2 id="first-part">First part</h2>')
    expect(html).toContain('<h3 id="a-sub-part">A sub-part</h3>')
    expect(headings).toEqual([
      { id: 'first-part', text: 'First part' },
      { id: 'second-with-style', text: 'Second, with style!' },
    ])
  })

  it('suffixes a repeated heading so ids stay unique', async () => {
    const { html, headings } = await compileEntry(
      '## Notes\n\n## Notes\n\n### Notes\n',
    )
    expect(headings.map((h) => h.id)).toEqual(['notes', 'notes-1'])
    expect(html).toContain('id="notes-2"')
  })

  it('is stable: the same markdown gives the same ids', async () => {
    const markdown = '## One\n\n## Two\n\n## One\n'
    const a = await compileEntry(markdown)
    const b = await compileEntry(markdown)
    expect(a).toEqual(b)
  })

  it('leaves the footnote heading alone and out of the contents', async () => {
    const { html, headings } = await compileEntry(
      '## Intro\n\nText[^1].\n\n## Footnote label\n\n[^1]: A note.\n',
    )
    expect(html).toContain('id="footnote-label"')
    expect(html).toContain('<h2 id="footnote-label-1">Footnote label</h2>')
    expect(headings.map((h) => h.id)).toEqual(['intro', 'footnote-label-1'])
  })

  it('still highlights code', async () => {
    const { html } = await compileEntry('## Code\n\n```js\nconst a = 1\n```\n')
    expect(html).toContain('shiki')
    expect(html).toContain('--shiki-dark')
  })
})
