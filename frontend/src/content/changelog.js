/**
 * The public changelog on /stats, read from `frontend/changelog.md`.
 *
 * The file is imported raw rather than through the markdown plugin: the
 * plugin compiles a post (frontmatter, one HTML document), and the page
 * needs dated entries. A line needs links only, so `renderLine` turns
 * `[text](href)` into a Link (a path) or an anchor (a URL) and leaves the
 * rest as text.
 *
 * `parseChangelog` throws on a heading that is not a date or a date with
 * no bullets, so a bad file fails the build, never a visitor's page.
 */

import { createElement } from 'react'
import { Link } from 'react-router'
import raw from '../../changelog.md?raw'

const DATE_HEADING = /^## (\d{4}-\d{2}-\d{2})\s*$/
const BULLET = /^- (.*)$/
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g

/**
 * Parses the changelog into entries, newest first whatever the file order.
 *
 * Before the first date heading only a `# ` title and prose are allowed.
 * A bullet may continue on indented lines.
 *
 * @param {string} text
 * @returns {{date: string, lines: string[]}[]}
 */
export function parseChangelog(text) {
  const entries = []
  let entry = null
  for (const line of text.split('\n')) {
    const heading = line.match(/^#{2,} /)
    if (heading) {
      const date = line.match(DATE_HEADING)
      if (!date) throw new Error(`changelog.md: not a date heading: ${line}`)
      if (entry && entry.lines.length === 0) {
        throw new Error(`changelog.md: no changes under ${entry.date}`)
      }
      entry = { date: date[1], lines: [] }
      entries.push(entry)
      continue
    }
    if (!entry) continue
    const bullet = line.match(BULLET)
    if (bullet) {
      entry.lines.push(bullet[1].trim())
    } else if (/^\s+\S/.test(line) && entry.lines.length) {
      entry.lines[entry.lines.length - 1] += ` ${line.trim()}`
    } else if (line.trim()) {
      throw new Error(`changelog.md: not a bullet under ${entry.date}: ${line}`)
    }
  }
  if (entry && entry.lines.length === 0) {
    throw new Error(`changelog.md: no changes under ${entry.date}`)
  }
  return entries.sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  )
}

/**
 * One changelog line as React nodes: text, with each markdown link a
 * router Link (href starting with `/`) or an anchor.
 *
 * @param {string} line
 * @returns {import('react').ReactNode[]}
 */
export function renderLine(line) {
  const nodes = []
  let last = 0
  for (const match of line.matchAll(LINK)) {
    if (match.index > last) nodes.push(line.slice(last, match.index))
    const [, text, href] = match
    nodes.push(
      href.startsWith('/')
        ? createElement(Link, { key: match.index, to: href }, text)
        : createElement(
            'a',
            { key: match.index, href, rel: 'noreferrer' },
            text,
          ),
    )
    last = match.index + match[0].length
  }
  if (last < line.length) nodes.push(line.slice(last))
  return nodes
}

export const CHANGELOG = parseChangelog(raw)
