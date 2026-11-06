/**
 * The public changelog on /stats, read from `frontend/changelog.md`.
 *
 * The file is imported raw rather than through the markdown plugin: the
 * plugin compiles a post (frontmatter, one HTML document), and the page
 * needs dated entries. A line needs links only, so `renderLine` turns
 * `[text](href)` into a Link (a path) or an anchor (a URL) and leaves the
 * rest as text.
 *
 * The parser is `lib/changelog.js`, which `scripts/prerender.mjs` also
 * runs on the file during the build, so a bad file fails the build before
 * this module can throw in a visitor's browser.
 */

import { createElement } from 'react'
import { Link } from 'react-router'
import raw from '../../changelog.md?raw'
import { parseChangelog } from '../lib/changelog.js'

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g

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
