// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
// Read from disk: Vitest stubs CSS imports, `?raw` included.
const css = readFileSync(join(here, 'index.css'), 'utf8')

/** Every `selectors { body }` pair with the @media prelude it sits in, or null. */
const rules = []
{
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const stack = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '{') {
      const prelude = text.slice(start, i).trim()
      stack.push({ prelude, atRule: prelude.startsWith('@'), bodyFrom: i + 1 })
      start = i + 1
    } else if (char === '}') {
      const open = stack.pop()
      if (open && !open.atRule) {
        const media = stack.find((entry) => entry.atRule)?.prelude ?? null
        const body = text.slice(open.bodyFrom, i)
        for (const selector of open.prelude.split(',')) {
          rules.push({
            selector: selector.trim().replace(/\s+/g, ' '),
            body,
            media,
          })
        }
      }
      start = i + 1
    }
  }
}

function bodyOf(selector, media = null) {
  const bodies = rules
    .filter((r) => r.selector === selector && r.media === media)
    .map((r) => r.body)
  expect(bodies.length, `a rule for ${selector}`).toBeGreaterThan(0)
  return bodies.join('\n')
}

describe('American spelling in admin copy (#505)', () => {
  const copyFiles = readdirSync(join(here, 'content'))
    .filter((name) => name.endsWith('.js') && !name.includes('.test.'))
    .map((name) => join('content', name))
  const files = [
    ...copyFiles,
    join('components', 'GarmentForm.jsx'),
    join('components', 'GarmentProductPanel.jsx'),
    join('components', 'intake', 'LinkCheck.jsx'),
  ]

  it.each(files)('%s has no British colour', (file) => {
    const source = readFileSync(join(here, file), 'utf8')
    expect(source.match(/\w*colour\w*/gi) ?? []).toEqual([])
  })
})

describe('admin tap targets reach 24px (#505, WCAG 2.5.8)', () => {
  const FLOOR = /min-height: 1\.5rem;/

  it.each([
    '.job-run',
    ".admin-head-end a:not(.btn):not([data-slot='button'])",
  ])('gives %s a 24px floor', (selector) => {
    expect(bodyOf(selector)).toMatch(FLOOR)
  })
})

describe('phone chip count keeps its space (#505)', () => {
  // `.chip` is inline-flex on a phone, and a flex container drops the
  // whitespace text between the label and the count span: "Active1".
  it('spaces the count from the label with a margin, not a text node', () => {
    expect(bodyOf('.chip > .chip-count', '@media (max-width: 700px)')).toMatch(
      /margin-inline-start: var\(--space-1\);/,
    )
  })
})
